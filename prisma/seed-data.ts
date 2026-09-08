/**
 * Seed-only fixtures. Deliberately NOT under `lib/` — branch records live in
 * the database, and compiling a hardcoded branch list into the application
 * bundle invites it drifting from the real data. Only `prisma/seed.ts` and its
 * tests import from here.
 */

export const SAMPLE_BRANCHES = [
  {
    slug: "accra-mall",
    name: "Basilissa Accra Mall",
    location: "Accra Mall, Spintex Road, Accra",
  },
  {
    slug: "achimota-mall",
    name: "Basilissa Achimota Mall",
    location: "Achimota mall, Accra",
  },
  {
    slug: "west-hills-mall",
    name: "Basilissa West Hills Mall",
    location: "West Hills, Accra",
  },
  {
    slug: "community-25-dawhenya",
    name: "Basilissa Dawhenya",
    location: "Tema Community 25",
  },
  {
    slug: "tema-community-6",
    name: "Basilissa Tema Branch",
    location: "Tema Community 6",
  },
] as const;
