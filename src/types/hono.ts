import type admin from "firebase-admin";

type Variables = {
  user: admin.auth.DecodedIdToken;
  userId: string;
  isAdmin: boolean;
};

export type { Variables };
