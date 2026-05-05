import type admin from "firebase-admin";
import { env } from "../config/env.js";
import { AppError, NotFoundError, UnauthorizedError, ValidationError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { getAuth, getFirestore } from "./firebase.js";

export interface UserDocument {
  uid: string;
  email: string;
  display_name: string;
  avatar_url: string;
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  user: UserDocument;
  idToken: string;
  refreshToken: string;
  isNewUser?: boolean;
}

export interface RefreshResponse {
  idToken: string;
  refreshToken: string;
}

interface CreateUserData {
  email: string;
  display_name?: string;
  avatar_url?: string;
}

function buildUserDoc(
  uid: string,
  data: CreateUserData,
): Omit<UserDocument, "uid"> & { uid: string } {
  const now = new Date().toISOString();
  return {
    uid,
    email: data.email,
    display_name: data.display_name || `user_${uid}`,
    avatar_url: data.avatar_url || "",
    created_at: now,
    updated_at: now,
  };
}

async function createUserDocument(uid: string, data: CreateUserData): Promise<UserDocument> {
  const db = getFirestore();
  const userDoc = buildUserDoc(uid, data);
  await db.collection("users").doc(uid).set(userDoc);
  return userDoc;
}

async function getUserDocument(uid: string): Promise<UserDocument | null> {
  const db = getFirestore();
  const doc = await db.collection("users").doc(uid).get();
  if (!doc.exists) return null;
  return doc.data() as UserDocument;
}

async function getOrCreateUserDocument(uid: string, data: CreateUserData): Promise<UserDocument> {
  const existing = await getUserDocument(uid);
  if (existing) return existing;

  // Use merge to avoid overwriting if another request created the doc concurrently
  const db = getFirestore();
  const userDoc = buildUserDoc(uid, data);
  await db.collection("users").doc(uid).set(userDoc, { merge: true });

  // Re-fetch to get the authoritative state (in case merge kept existing values)
  const saved = await getUserDocument(uid);
  if (!saved) {
    throw new AppError(500, "Failed to create user document", "USER_CREATE_ERROR");
  }
  return saved;
}

async function exchangeCustomToken(
  customToken: string,
): Promise<{ idToken: string; refreshToken: string }> {
  if (!env.firebaseApiKey) {
    throw new AppError(500, "Authentication service not configured", "AUTH_SERVICE_ERROR");
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${env.firebaseApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: customToken,
        returnSecureToken: true,
      }),
    },
  );

  const body = await response.json();

  if (!response.ok) {
    logger.error("Failed to exchange custom token", {
      status: response.status,
      error: body?.error?.message,
    });
    throw new AppError(500, "Failed to exchange token", "TOKEN_EXCHANGE_ERROR");
  }

  return {
    idToken: body.idToken as string,
    refreshToken: body.refreshToken as string,
  };
}

export async function refreshIdToken(refreshToken: string): Promise<RefreshResponse> {
  if (!env.firebaseApiKey) {
    throw new AppError(500, "Authentication service not configured", "AUTH_SERVICE_ERROR");
  }

  const response = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${env.firebaseApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    },
  );

  const body = await response.json();

  if (!response.ok) {
    const errorMessage = body?.error?.message as string | undefined;

    if (errorMessage === "TOKEN_EXPIRED" || errorMessage === "INVALID_REFRESH_TOKEN") {
      throw new UnauthorizedError("Invalid or expired refresh token");
    }

    logger.error("Failed to refresh token", {
      status: response.status,
      error: errorMessage,
    });
    throw new UnauthorizedError("Token refresh failed");
  }

  return {
    idToken: body.id_token as string,
    refreshToken: body.refresh_token as string,
  };
}

export async function registerWithEmail(
  email: string,
  password: string,
  displayName?: string,
): Promise<AuthResponse> {
  const auth = getAuth();

  // Create user in Firebase Auth
  let userRecord: admin.auth.UserRecord;
  try {
    userRecord = await auth.createUser({
      email,
      password,
      displayName: displayName || undefined,
    });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "auth/email-already-exists") {
      throw new ValidationError("Email already registered", {
        field: "email",
      });
    }
    logger.error("Failed to create user", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw new AppError(500, "Failed to create user", "AUTH_ERROR");
  }

  // Create Firestore user doc
  const user = await createUserDocument(userRecord.uid, {
    email,
    display_name: displayName || `user_${userRecord.uid}`,
  });

  // Generate custom token and exchange for ID token
  const customToken = await auth.createCustomToken(userRecord.uid);
  const { idToken, refreshToken } = await exchangeCustomToken(customToken);

  logger.info("User registered", { uid: userRecord.uid, email });

  return { user, idToken, refreshToken };
}

export async function loginWithEmail(email: string, password: string): Promise<AuthResponse> {
  if (!env.firebaseApiKey) {
    throw new AppError(500, "Authentication service not configured", "AUTH_SERVICE_ERROR");
  }

  // Verify credentials via Identity Toolkit REST API
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.firebaseApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    },
  );

  const body = await response.json();

  if (!response.ok) {
    const errorMessage = body?.error?.message as string | undefined;

    if (
      errorMessage === "EMAIL_NOT_FOUND" ||
      errorMessage === "INVALID_PASSWORD" ||
      errorMessage === "INVALID_LOGIN_CREDENTIALS"
    ) {
      throw new UnauthorizedError("Invalid email or password");
    }

    if (errorMessage === "TOO_MANY_ATTEMPTS_TRY_LATER") {
      throw new UnauthorizedError("Too many attempts. Please try again later.");
    }

    logger.error("Identity Toolkit login failed", {
      status: response.status,
      error: errorMessage,
    });
    throw new UnauthorizedError("Login failed");
  }

  const uid = body.localId as string;
  const userEmail = body.email as string;
  const idToken = body.idToken as string;
  const refreshToken = body.refreshToken as string;

  // Get or create Firestore user doc (self-healing)
  const user = await getOrCreateUserDocument(uid, {
    email: userEmail,
    display_name: `user_${uid}`,
  });

  logger.info("User logged in", { uid, email: userEmail });

  return { user, idToken, refreshToken };
}

export async function loginWithGoogle(googleIdToken: string): Promise<AuthResponse> {
  const auth = getAuth();

  // Verify the Google ID token
  let decodedToken: admin.auth.DecodedIdToken;
  try {
    decodedToken = await auth.verifyIdToken(googleIdToken);
  } catch (err) {
    logger.warn("Google ID token verification failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw new UnauthorizedError("Invalid Google ID token");
  }

  const uid = decodedToken.uid;
  const email = decodedToken.email || "";
  const name = decodedToken.name;
  const picture = decodedToken.picture;

  // Get or create Firestore user doc
  const isNewUser = !(await getUserDocument(uid));
  const user = await getOrCreateUserDocument(uid, {
    email,
    display_name: name || undefined,
    avatar_url: picture || undefined,
  });

  // Generate custom token and exchange for ID token
  const customToken = await auth.createCustomToken(uid);
  const { idToken, refreshToken } = await exchangeCustomToken(customToken);

  logger.info("User logged in with Google", {
    uid,
    email,
    isNewUser,
  });

  return { user, idToken, refreshToken, isNewUser };
}

export async function getUserProfile(uid: string): Promise<UserDocument> {
  const user = await getUserDocument(uid);
  if (!user) {
    throw new NotFoundError("User profile not found");
  }
  return user;
}
