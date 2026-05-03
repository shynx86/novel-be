# m-service-diary

Diary microservice for MimosaTek. Manages tasks, todo items, area diary entries, and scouting records for agricultural farm management.

## Stack

- **Runtime**: Node.js (≥12)
- **Framework**: Express + Apollo Server (GraphQL v14, `graphql-tools`)
- **Event sourcing**: `jerni` / `jerni-dev` — all mutations emit events (`journey.commit()`); reads come from projected MongoDB collections
- **Database**: MongoDB (accessed via raw driver, not Mongoose)
- **Queue**: Bull (Redis-backed)
- **Auth**: JWT (`jsonwebtoken`)
- **Formatting**: Biome (`npx @biomejs/biome format --write`)
- **Testing**: Jest (`--runInBand` required — tests share a MongoDB instance)

## Project layout

```
src/
  graphql/          # One folder per domain (Task, Area, Farm, …)
    Task/
      Task.graphql  # Schema definitions (extend type Query/Mutation)
      Task.resolver.js
  auth.js           # canAccessArea, canAccessFarm, canAccessTask, getIsAdmin, …
  context.js        # Builds per-request context (DataLoaders, MongoDB collections, journey)
  schema.js         # Merges all .graphql files + resolvers
  services/task.js  # Business logic helpers (e.g. getTasksByTimeline)
  models/           # MongoDB model helpers
tests/
  graphql/
    Task/
      task-fixtures.js          # Shared constants (ASSET_CREATED, examples, …)
      Task.create.spec.js
      Task.delete.spec.js
      Task.update.spec.js
      Task.todo-lists.spec.js
      Task.user-assignment.spec.js
      Task.pagination.spec.js
    TodoItem/
      TodoItem.spec.js
      query.js                  # Local GQL query strings for TodoItem tests
    query-samples.js            # Shared GQL query strings used across tests
  factory/
    Task.js                     # factory-js definitions for test data
  withJourney.js                # Test helper: spins up in-memory jerni journey + MongoDB
```

## Event sourcing pattern

Mutations do not write to MongoDB directly. They call `journey.commit({ type, payload })`. A separate subscription process consumes events and projects them into MongoDB collections (`Todos`, `TodoItems`, etc.).

In tests, `withJourney` replays `initialEvents` to seed state, then `journey.waitFor(committed[N])` awaits projection.

## Key domain concepts

- **Task** (`Todos` collection): The recurring task definition. Has `dtstart`, `until`, `frequency`, `interval` (rrule fields). Created via `IRRIGATION_AREA:TODO_CREATED`.
- **TodoItem** (`TodoItems` collection): A single occurrence of a task at a specific time. Created by the subscription projector from the Task rrule. Updated via `IRRIGATION_AREA:TODO_STATUS_UPDATED`.
- **TaskType** enum: `BasicTask`, `FeedbackTask`, `TicketTask`, `IrrigationTask`, `AreaDiaryTask`, `AreaIrrigationRecommendationTask`, `ScoutingHoaAdvisorTask`, `ScoutingHoaFarmerTask`, `ScoutingCaChuaFarmerTask`
- `AreaDiaryTask` and `AreaIrrigationRecommendationTask` are immutable types (`NO_MUTATION_TASK_TYPES`) — cannot be changed to/from other types.

## Multi-user assignment

Tasks and todo items are assigned to **multiple users** via `user_ids: [ID!]` (array). The old singular `user_id` field has been fully removed.

- `TaskInput.user_ids`, `TaskUpdate.user_ids` — create/update task with assigned users
- `Task.users: [UserPublicDetail!]` — resolved output via `UserByIdLoader`
- `TodoItem.user_ids` / `TodoItem.users: [UserPublicDetail!]` — output fields; `user_id` and `user` no longer exist
- `TodoItemsByAreaInputV2.user_ids` — filter todo items by user(s)
- `UpdateTodoItemInput.user_ids` — update todo item user assignment (admin only)
- MongoDB query `{ user_ids: "some_user_id" }` matches documents where the array contains that value — used for single-user filtering without `$in`.
- Non-admins cannot assign tasks to users that don't include themselves.
- `getTasksByTimeline` (services/task.js) filters tasks by `user_ids: { $exists: true, $ne: null }` and projects the `user_ids` field — callers (`getTreeWorkRecordStatsForUsers`, `getUsersPerformTasks`) rely on this to group tasks per user.

## Authorization

`pipeResolvers` chains are used throughout. Common guards:
- `canAccessArea("area_id")` — checks area belongs to user's farm
- `canAccessTask("task_id")` — loads task into `root.task`
- `getIsAdmin` — sets `root.is_admin`
- `isAuthenticated` — checks JWT

## DataLoaders (context)

- `UserByIdLoader` — loads `UserPublicDetail` by ID; used in `Task.users` and `TodoItem.users` resolvers via `loadMany`
- `AreaByIdLoader`, `AssetByIdLoader`, `ResourceByIdLoader`, `ProtocolByIdLoader`, `GrowthStagesByIdLoader`

## Testing conventions

- Tests use `withJourney({ url, dbName, initialEvents }, async (journey, models) => {...})`
- `getTestContext({ journey, models })` builds a full resolver context
- Factories are in `tests/factory/` using `factory-js`; `Factory.build("Task FeedbackTask")` uses traits
- The `Task` factory produces `user_ids: null` by default; seed events should set `user_ids: ["user_1"]` explicitly
- `buildTodoCreatedEvent(record)` in `Task.todo-lists.spec.js` sets `user_ids: ["user_1"]` on events
- Shared fixtures (ASSET_CREATED, TOOL_CREATED, RESOURCE_CREATED, PROTOCOL_CREATED, examples) live in `tests/graphql/Task/task-fixtures.js`
- Query strings live in `tests/graphql/query-samples.js` — update there when schema fields change
- Run tests: `npm run test:dev`

## External service integrations

- **OmiCall / UCall**: Callbot integrations for `AreaDiaryTask`. Configured via `assign_callbot_for_task` mutation.
- **micro-diary-client**: `getTreeWorkRecordStatistics`, `getTreeWorkRecordStatisticsByTaskIds` — called with `{ inputs: [{ user_id, task_ids }], headers }`. The external API still uses singular `user_id` per input entry even though tasks now store `user_ids` arrays internally.
- **OpenAI**: Used in `src/services/openai.js`
- **S3**: Asset uploads via `src/s3.js`

## TodoItem regeneration on Task update

When a `IRRIGATION_AREA:TODO_UPDATED` event is committed with `rrule_args_changed: true`, the TodoItem subscriber (`@mimosa/diary-subscription/src/TodoItem.js`) regenerates occurrences using a diff strategy:

1. **`updateMany`** — updates all existing TodoItems for the task with the new field values (dtstart, until, user_ids, etc.). This always runs.
2. **Diff old vs new occurrences** — computes old occurrences from `old_rrule_args` and new occurrences from the updated rrule fields.
3. **`deleteMany`** — deletes TodoItems whose IDs are in old occurrences but NOT in new occurrences.
4. **`insertMany`** — inserts new TodoItems whose IDs are in new occurrences but NOT in old occurrences.

**Event payload requirements** when `rrule_args_changed: true`:
- `old_rrule_args`: `{ dtstart, until, frequency, interval, loop_day_of_week }` — the rrule args BEFORE the update, used to compute which old TodoItems to delete.
- `rrule_args_changed: true` — flag that triggers the regeneration path.
- All task fields needed by `generateTodoItemFromTaskToInsert` must be present in the payload (including `resource_ids`, `tool_ids`, `growth_stage_id`, `user_ids`, `area_id`, etc.) — the subscriber passes them to regenerate complete new TodoItems.

**The resolver** (`update_task` in `Task.resolver.js`) achieves this by spreading `omitAll(MONGO_INTERNAL_FIELDS, task)` into the payload before `validTask`, so all existing task fields carry over even if only dtstart/until changed.

**Key gotcha**: the `TODO_UPDATED` subscriber handler must destructure every field it references in the `generateTodoItemFromTaskToInsert` call from the payload. Missing a destructured variable (e.g. `resource_ids`, `tool_ids`) causes a `ReferenceError` that is silently swallowed by jerni's inner try-catch — zeroing ALL ops for that event including the `updateMany`.

## Common gotchas

- `validateTaskByType` uses `pick()` to whitelist fields per `TaskType` — any new field on inputs must be added to `commonFields` or a specific type's field list.
- `buildTodoItemFilter` passes a single user ID string as `user_ids` value; MongoDB array-contains semantics handles this.
- `getUsersPerformTasks` uses `tasks.flatMap(t => t.user_ids || [])` — tasks with no assigned users are excluded.
- `getTreeWorkRecordStatsForUsers` iterates `task.user_ids` array to build per-user task ID groups.
- `getTreeWorkRecordStatisticsByTaskIds` (external micro-diary-client API) still uses singular `user_id` per input entry — this is an API contract of the external service, not a migration oversight.
