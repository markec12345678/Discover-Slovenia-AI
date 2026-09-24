// Enkratni zagon additivne migracije Issue #4 §13 (za dev DB, pred db push).
// isto logiko ob vsakem zagonu izvede src/instrumentation.ts (fail-open).
import { PrismaClient } from "@prisma/client";
import { migrateTripCollaboratorSchemaWith } from "../../src/lib/trip-collaborator-migration";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

const db = new PrismaClient();
const r = await migrateTripCollaboratorSchemaWith(db);
console.log(JSON.stringify(r, null, 2));
await db.$disconnect();
