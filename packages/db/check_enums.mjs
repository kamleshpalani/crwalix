import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const enums = await p.$queryRawUnsafe(
  `SELECT typname FROM pg_type WHERE typtype='e' ORDER BY typname`,
);
console.log("Enums:", JSON.stringify(enums.map((x) => x.typname)));
const cols = await p.$queryRawUnsafe(
  `SELECT column_name, udt_name FROM information_schema.columns WHERE table_name='Invoice' ORDER BY ordinal_position`,
);
console.log(
  "Invoice cols:",
  JSON.stringify(cols.map((x) => x.column_name + ":" + x.udt_name)),
);
await p.$disconnect();
