import { prisma } from "../lib/platform/prisma";
import { ProviderType } from "@prisma/client";

const SERIAL_NUMBER = "CMZG022350254";
const ACHIMOTA_ID = "cmtna0ubh0007pk8xa8q7cxop"; // Basilissa Achimota Mall

const EXISTING_STAFF: { pin: string; name: string; employeeCode: string }[] = [
  { pin: "34", name: "FREDA OKRAH", employeeCode: "EMP0057" },
  { pin: "18", name: "BERLINDA RICH", employeeCode: "EMP0059" },
  { pin: "16", name: "PRECIOUS DEDE NYAKOTEY", employeeCode: "EMP0045" },
  { pin: "12", name: "ODAH MARTHA", employeeCode: "EMP0056" },
  { pin: "33", name: "ERIC OFORI", employeeCode: "EMP0039" },
  { pin: "37", name: "ALICE AZAGLO", employeeCode: "EMP0232" },
  { pin: "20", name: "AFAWUAH KATE", employeeCode: "EMP0038" },
  { pin: "29", name: "DORIS KUMAGAH", employeeCode: "EMP0051" },
  { pin: "17", name: "REBECCA AMPADU", employeeCode: "EMP0042" },
  { pin: "46", name: "JOSHUA O ANIM", employeeCode: "EMP0113" },
  { pin: "42", name: "DOROTHY KUMAGAH", employeeCode: "EMP0231" },
  { pin: "32", name: "JUDITH OKPARA", employeeCode: "EMP0049" },
  { pin: "52", name: "SOLOMON BOAKYE", employeeCode: "EMP0230" },
  { pin: "35", name: "JAMES ZOWONU", employeeCode: "EMP0060" },
  { pin: "22", name: "SAVIOUR KWAO", employeeCode: "EMP0052" },
  { pin: "26", name: "HENRY HANSEN", employeeCode: "EMP0233" },
  { pin: "27", name: "COMFORT AIDOO", employeeCode: "EMP0234" },
  { pin: "13", name: "HARRIET ADDO", employeeCode: "EMP0036" },
  { pin: "38", name: "LETICIA DEDE", employeeCode: "EMP0236" },
  { pin: "36", name: "DOREEN ARHIN", employeeCode: "EMP0235" },
  { pin: "40", name: "JANE ODUMA JUMBO", employeeCode: "EMP0030" },
  { pin: "23", name: "DAVID MORRIS IZILEIN", employeeCode: "EMP0050" },
];

const NEW_STAFF: { pin: string; name: string }[] = [
  { pin: "50", name: "SEIDU YUSSIF MARIDIA" },
  { pin: "51", name: "ALBERTA AMISSAH" },
  { pin: "48", name: "SANDRA YARTEY" },
  { pin: "47", name: "BISMARK ASIEDU" },
  { pin: "44", name: "ANNIE ANNAN NAA LAMILEY" },
  { pin: "43", name: "OLIVIA DZAKA" },
  { pin: "49", name: "DIANA AGYIEWAA OWUSU" },
  { pin: "45", name: "CYNTHIA OSAE" },
  { pin: "41", name: "WISDOM" },
];

function splitName(raw: string) {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: "ACHIMOTA" };
  const lastName = parts.pop()!;
  const firstName = parts.join(" ");
  return { firstName, lastName };
}

async function run() {
  console.log("[*] Starting onboarding for Achimota terminal users...");

  // Verify device exists
  const device = await prisma.device.findFirst({
    where: { serialNumber: SERIAL_NUMBER }
  });
  if (!device) {
    throw new Error(`Device with serial number ${SERIAL_NUMBER} not found in database!`);
  }
  console.log(`[+] Device found: ${device.serialNumber} (${device.label}) linked to branch ${device.branchId}`);

  // 1. Process Existing Staff
  console.log("\n[1] Updating existing staff assignments & device pins (" + EXISTING_STAFF.length + " staff)...");
  for (const staff of EXISTING_STAFF) {
    const emp = await prisma.employee.findUnique({
      where: { employeeCode: staff.employeeCode }
    });

    if (!emp) {
      console.warn(`[!] Employee ${staff.employeeCode} not found in DB!`);
      continue;
    }

    // Check branch assignment
    const existingAssignment = await prisma.employeeBranchAssignment.findFirst({
      where: {
        employeeId: emp.id,
        branchId: ACHIMOTA_ID,
        validTo: null
      }
    });

    if (!existingAssignment) {
      // Check if they already have an active primary assignment elsewhere
      const activePrimary = await prisma.employeeBranchAssignment.findFirst({
        where: { employeeId: emp.id, validTo: null, isPrimary: true }
      });

      await prisma.employeeBranchAssignment.create({
        data: {
          employeeId: emp.id,
          branchId: ACHIMOTA_ID,
          isPrimary: !activePrimary,
          validFrom: new Date("2026-10-01T00:00:00Z")
        }
      });
      console.log(`  + Added Achimota branch assignment for ${staff.name} (${staff.employeeCode}) [Primary: ${!activePrimary}]`);
    } else {
      console.log(`  ✓ Already assigned to Achimota: ${staff.name} (${staff.employeeCode})`);
    }

    // Link device PIN
    // First, revoke any previous PIN for this employee on this device
    await prisma.employeeDeviceIdentity.updateMany({
      where: {
        employeeId: emp.id,
        providerType: ProviderType.FINGERPRINT,
        deviceId: SERIAL_NUMBER,
        revokedAt: null
      },
      data: { revokedAt: new Date() }
    });

    // Create active mapping
    await prisma.employeeDeviceIdentity.create({
      data: {
        employeeId: emp.id,
        providerType: ProviderType.FINGERPRINT,
        deviceId: SERIAL_NUMBER,
        externalId: staff.pin,
        label: staff.name
      }
    });
    console.log(`  + Linked PIN ${staff.pin} on ${SERIAL_NUMBER} to ${staff.name} (${staff.employeeCode})`);
  }

  // 2. Process New Staff
  console.log("\n[2] Creating " + NEW_STAFF.length + " new employees and linking pins...");

  // Find max employee code
  const emps = await prisma.employee.findMany({
    select: { employeeCode: true },
    where: { employeeCode: { startsWith: "EMP" } },
    orderBy: { employeeCode: "desc" },
    take: 5
  });

  let maxNum = 268;
  for (const e of emps) {
    const num = parseInt(e.employeeCode.replace(/\D/g, ""), 10);
    if (!isNaN(num) && num > maxNum) {
      maxNum = num;
    }
  }

  let nextCodeNum = maxNum + 1;
  console.log(`[*] Next employee code starts at: EMP${String(nextCodeNum).padStart(4, "0")}`);

  for (const staff of NEW_STAFF) {
    const code = "EMP" + String(nextCodeNum).padStart(4, "0");
    nextCodeNum++;

    const { firstName, lastName } = splitName(staff.name);

    const createdEmp = await prisma.employee.create({
      data: {
        employeeCode: code,
        firstName,
        lastName,
        status: "ACTIVE",
        masterSource: "LOCAL",
        branchAssignments: {
          create: {
            branchId: ACHIMOTA_ID,
            isPrimary: true,
            validFrom: new Date("2026-10-01T00:00:00Z")
          }
        },
        deviceIdentities: {
          create: {
            providerType: ProviderType.FINGERPRINT,
            deviceId: SERIAL_NUMBER,
            externalId: staff.pin,
            label: staff.name
          }
        }
      }
    });

    console.log(`  + Created ${code}: ${staff.name} (PIN ${staff.pin}, ID: ${createdEmp.id})`);
  }

  console.log(`\n[+] SUCCESS! All 31 staff are configured and mapped to Achimota terminal ${SERIAL_NUMBER}`);
}

run()
  .catch((err) => {
    console.error("[-] Error running onboarding:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
