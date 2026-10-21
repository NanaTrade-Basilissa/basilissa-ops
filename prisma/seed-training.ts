import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Training Hub modules...");

  // 1. Locate Augustine Cobbold (IT, 0542958451)
  const employee = await prisma.employee.findFirst({
    where: {
      OR: [
        { phone: "0542958451" },
        { phone: { contains: "542958451" } },
        { employeeCode: "BSE001" },
      ],
    },
    select: { id: true, firstName: true, lastName: true, phone: true, jobTitle: true, employeeCode: true },
  });

  if (!employee) {
    throw new Error("Could not find employee Augustine Cobbold with phone 0542958451");
  }

  console.log(`Found target employee: ${employee.firstName} ${employee.lastName} (${employee.employeeCode}, ${employee.phone}, ${employee.jobTitle})`);

  // 2. Locate an admin user to own the training courses
  const adminUser = await prisma.user.findFirst({
    where: {
      status: "ACTIVE",
    },
    select: { id: true, email: true },
  });

  const createdById = adminUser?.id;

  // 3. Define the 4 Training Courses
  const coursesData = [
    {
      title: "Food Hygiene & Temperature Control Standards 2026",
      description: "Comprehensive food safety guidelines, HACCP temperature thresholds, cross-contamination prevention, and daily sanitization procedures across all kitchen prep areas.",
      category: "Food Safety & Hygiene",
      estimatedMinutes: 20,
      isMandatory: true,
      dueDays: 7,
      status: "PUBLISHED" as const,
      materials: [
        {
          title: "Lesson 1: Hand Hygiene & PPE Protocol",
          description: "Proper hand washing steps, glove change frequencies, and cross-contamination prevention rules.",
          type: "VIDEO" as const,
          fileUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
          fileKey: "samples/hand-hygiene.mp4",
          fileSize: 15482000,
          durationSeconds: 120,
          mimeType: "video/mp4",
          order: 1,
        },
        {
          title: "SOP Guideline: HACCP Temperature Logging Sheet",
          description: "Official Basilissa standard operating procedure for monitoring chiller and freezer temperatures.",
          type: "PDF" as const,
          fileUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
          fileKey: "samples/haccp-temperature-sop.pdf",
          fileSize: 245000,
          durationSeconds: null,
          mimeType: "application/pdf",
          order: 2,
        },
      ],
    },
    {
      title: "Customer Service Excellence & Hospitality Protocol",
      description: "Delivering exceptional guest experiences: greeting etiquette, active listening, handling customer feedback constructively, and brand presentation.",
      category: "Customer Service",
      estimatedMinutes: 15,
      isMandatory: true,
      dueDays: 5,
      status: "PUBLISHED" as const,
      materials: [
        {
          title: "Service Protocol: The 5-Step Customer Welcome",
          description: "Step-by-step video training on greeting customers at the counter and dining floor.",
          type: "VIDEO" as const,
          fileUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
          fileKey: "samples/customer-welcome.mp4",
          fileSize: 25000000,
          durationSeconds: 180,
          mimeType: "video/mp4",
          order: 1,
        },
        {
          title: "Front-of-House Dining Room Setup Standard",
          description: "Visual infographic detailing table presentation, counter cleanliness, and condiment station layout.",
          type: "IMAGE" as const,
          fileUrl: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&q=80",
          fileKey: "samples/foh-standards.jpg",
          fileSize: 1840000,
          durationSeconds: null,
          mimeType: "image/jpeg",
          order: 2,
        },
      ],
    },
    {
      title: "Emergency Response, Fire Safety & Basic First Aid",
      description: "Critical safety procedures for kitchen and dining staff: operating fire blankets, fire extinguisher PASS method, handling minor burns, and evacuation coordination.",
      category: "Health & Safety",
      estimatedMinutes: 25,
      isMandatory: true,
      dueDays: 14,
      status: "PUBLISHED" as const,
      materials: [
        {
          title: "Fire Safety Drill: Emergency Evacuation Plan",
          description: "Complete guide on emergency exit routes, assembly points, and incident reporting.",
          type: "PDF" as const,
          fileUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
          fileKey: "samples/fire-safety-manual.pdf",
          fileSize: 450000,
          durationSeconds: null,
          mimeType: "application/pdf",
          order: 1,
        },
        {
          title: "Kitchen Fire Suppression System & First Aid Protocol",
          description: "Demonstration of kitchen hood suppression activation and treating minor kitchen cuts and burns.",
          type: "VIDEO" as const,
          fileUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
          fileKey: "samples/kitchen-first-aid.mp4",
          fileSize: 12000000,
          durationSeconds: 90,
          mimeType: "video/mp4",
          order: 2,
        },
      ],
    },
    {
      title: "Kitchen Equipment Care, Deep Cleaning & Preventative Maintenance",
      description: "Daily shut-down routines, deep sanitization, filter cleaning for fryers, grills, ovens, and cold storage maintenance to maximize equipment longevity.",
      category: "Operations",
      estimatedMinutes: 30,
      isMandatory: false,
      dueDays: 10,
      status: "PUBLISHED" as const,
      materials: [
        {
          title: "Deep Cleaning Checklist: Closing Routine",
          description: "End-of-day kitchen closing and chemical safety sanitization checklist for supervisors.",
          type: "PDF" as const,
          fileUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
          fileKey: "samples/cleaning-checklist.pdf",
          fileSize: 310000,
          durationSeconds: null,
          mimeType: "application/pdf",
          order: 1,
        },
        {
          title: "Safe Chemical Dilution & Equipment Care Chart",
          description: "Visual reference for sanitizing chemical ratios and color-coded microfiber cloth usage.",
          type: "IMAGE" as const,
          fileUrl: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200&q=80",
          fileKey: "samples/chemical-safety-chart.jpg",
          fileSize: 1420000,
          durationSeconds: null,
          mimeType: "image/jpeg",
          order: 2,
        },
      ],
    },
  ];

  const now = new Date();

  for (const c of coursesData) {
    // Check if course already exists with this title
    let course = await prisma.trainingCourse.findFirst({
      where: { title: c.title },
    });

    if (!course) {
      course = await prisma.trainingCourse.create({
        data: {
          title: c.title,
          description: c.description,
          category: c.category,
          estimatedMinutes: c.estimatedMinutes,
          isMandatory: c.isMandatory,
          dueDays: c.dueDays,
          status: c.status,
          publishedAt: now,
          targetAll: true,
          createdById: createdById ?? undefined,
        },
      });
      console.log(`Created course: "${course.title}" (${course.id})`);
    } else {
      console.log(`Updating existing course: "${course.title}" (${course.id})`);
      await prisma.trainingCourse.update({
        where: { id: course.id },
        data: {
          status: "PUBLISHED",
          publishedAt: now,
        },
      });
    }

    // Add materials
    for (const m of c.materials) {
      const existingMat = await prisma.trainingMaterial.findFirst({
        where: {
          courseId: course.id,
          title: m.title,
        },
      });

      if (!existingMat) {
        await prisma.trainingMaterial.create({
          data: {
            courseId: course.id,
            title: m.title,
            description: m.description,
            type: m.type,
            fileUrl: m.fileUrl,
            fileKey: m.fileKey,
            fileSize: m.fileSize,
            durationSeconds: m.durationSeconds,
            mimeType: m.mimeType,
            order: m.order,
          },
        });
        console.log(`  + Added material: ${m.title} [${m.type}]`);
      }
    }

    // Create / Update assignment for Augustine Cobbold
    const dueAt = new Date(now.getTime() + c.dueDays * 86400000);
    const assignment = await prisma.trainingAssignment.upsert({
      where: {
        courseId_employeeId: {
          courseId: course.id,
          employeeId: employee.id,
        },
      },
      create: {
        courseId: course.id,
        employeeId: employee.id,
        status: "NOT_STARTED",
        assignedAt: now,
        dueAt,
      },
      update: {
        dueAt,
      },
    });

    console.log(`  -> Assigned to Augustine Cobbold (Assignment ID: ${assignment.id}, Due: ${dueAt.toISOString().split("T")[0]})`);
  }

  console.log("Successfully seeded 4 training courses and assigned them to Augustine Cobbold!");
}

main()
  .catch((err) => {
    console.error("Seeding failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
