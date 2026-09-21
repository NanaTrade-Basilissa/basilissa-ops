import fs from "node:fs";
import path from "node:path";
import {
  PrismaClient,
  AptitudeTestStatus,
  AptitudeQuestionKind,
  IdentityFieldMode,
} from "@prisma/client";

// In dev, strictly load .env.local — nothing dev touches .env
const envLocalPath = path.resolve(process.cwd(), ".env.local");
let localDatabaseUrl = process.env.DATABASE_URL;

if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("DATABASE_URL=")) {
      localDatabaseUrl = trimmed.replace("DATABASE_URL=", "").trim();
      process.env.DATABASE_URL = localDatabaseUrl;
      break;
    }
  }
}

const prisma = new PrismaClient({
  datasourceUrl: localDatabaseUrl,
});

export const APTITUDE_ASSESSMENT_TEST_SECTIONS = [
  {
    title: "Critical Thinking & Business Analytics",
    description: "10 questions | 10 minutes",
    order: 1,
    timeLimitMinutes: 10,
    questions: [
      {
        order: 1,
        text: "A branch's sales have fallen by 15% over the past three months, but customer visits have remained almost the same. What should you investigate first?",
        points: 1,
        options: [
          { order: 1, text: "Whether the branch needs more staff", isCorrect: false },
          { order: 2, text: "Whether the average amount spent per customer has changed", isCorrect: true },
          { order: 3, text: "Whether the branch should be closed", isCorrect: false },
          { order: 4, text: "Whether employees are working overtime", isCorrect: false },
        ],
      },
      {
        order: 2,
        text: "A branch reports high sales but consistently records low profit. Which factor would be most important to investigate?",
        points: 1,
        options: [
          { order: 1, text: "Number of employees wearing uniforms", isCorrect: false },
          { order: 2, text: "Operating costs and cost of goods sold", isCorrect: true },
          { order: 3, text: "Number of tables in the branch", isCorrect: false },
          { order: 4, text: "Opening hours only", isCorrect: false },
        ],
      },
      {
        order: 3,
        text: "Two branches have the same monthly sales. Branch A serves 2,000 customers while Branch B serves 1,200 customers. What would be useful to calculate to understand the difference?",
        points: 1,
        options: [
          { order: 1, text: "Number of employees", isCorrect: false },
          { order: 2, text: "Average revenue per customer", isCorrect: true },
          { order: 3, text: "Number of tables", isCorrect: false },
          { order: 4, text: "Number of working days", isCorrect: false },
        ],
      },
      {
        order: 4,
        text: "A report shows that food wastage increased by 30% while sales remained unchanged. What is the most reasonable conclusion?",
        points: 1,
        options: [
          { order: 1, text: "Sales performance has improved", isCorrect: false },
          { order: 2, text: "The branch may have an operational efficiency problem", isCorrect: true },
          { order: 3, text: "Customer demand has increased", isCorrect: false },
          { order: 4, text: "More employees should automatically be hired", isCorrect: false },
        ],
      },
      {
        order: 5,
        text: "Management notices that cancellations on delivery orders have increased. What should an analyst investigate first?",
        points: 1,
        options: [
          { order: 1, text: "Only the price of food", isCorrect: false },
          { order: 2, text: "The reasons, timing and patterns behind the cancellations", isCorrect: true },
          { order: 3, text: "Whether employees like their jobs", isCorrect: false },
          { order: 4, text: "The branch's interior decoration", isCorrect: false },
        ],
      },
      {
        order: 6,
        text: "A branch has exceeded its sales target for three consecutive months. What should an analyst do before concluding that the branch is performing well?",
        points: 1,
        options: [
          { order: 1, text: "Look only at the sales figure", isCorrect: false },
          { order: 2, text: "Compare sales with costs, profit, targets and other relevant performance indicators", isCorrect: true },
          { order: 3, text: "Assume the manager is performing exceptionally", isCorrect: false },
          { order: 4, text: "Stop monitoring the branch", isCorrect: false },
        ],
      },
      {
        order: 7,
        text: "You discover that two reports show different sales figures for the same branch and period. What should you do first?",
        points: 1,
        options: [
          { order: 1, text: "Choose the higher figure", isCorrect: false },
          { order: 2, text: "Choose the lower figure", isCorrect: false },
          { order: 3, text: "Identify the source, definitions and methodology used in each report", isCorrect: true },
          { order: 4, text: "Average the two figures", isCorrect: false },
        ],
      },
      {
        order: 8,
        text: "A branch has low morning sales but strong evening sales. Which action demonstrates the strongest analytical approach?",
        points: 1,
        options: [
          { order: 1, text: "Immediately reduce morning staff", isCorrect: false },
          { order: 2, text: "Investigate customer traffic, product demand and operating patterns during different periods", isCorrect: true },
          { order: 3, text: "Close the branch in the morning", isCorrect: false },
          { order: 4, text: "Increase prices in the evening", isCorrect: false },
        ],
      },
      {
        order: 9,
        text: "Management wants to improve branch performance. Which information would be most useful for identifying areas for improvement?",
        points: 1,
        options: [
          { order: 1, text: "Sales alone", isCorrect: false },
          { order: 2, text: "Sales, customer numbers, costs, wastage, labour and other relevant operational indicators", isCorrect: true },
          { order: 3, text: "Staff names only", isCorrect: false },
          { order: 4, text: "Branch location only", isCorrect: false },
        ],
      },
      {
        order: 10,
        text: "You are given a large dataset but no clear business question. What should you do first?",
        points: 1,
        options: [
          { order: 1, text: "Start creating conclusions from the data", isCorrect: false },
          { order: 2, text: "Identify the business objective and determine what information is needed to answer it", isCorrect: true },
          { order: 3, text: "Delete unnecessary information immediately", isCorrect: false },
          { order: 4, text: "Calculate the average of every column", isCorrect: false },
        ],
      },
    ],
  },
  {
    title: "Arithmetic",
    description: "10 questions | 10 minutes",
    order: 2,
    timeLimitMinutes: 10,
    questions: [
      {
        order: 1,
        text: "A branch records GH¢45,000 in sales in January and GH¢54,000 in February. What was the percentage increase?",
        points: 1,
        options: [
          { order: 1, text: "15%", isCorrect: false },
          { order: 2, text: "18%", isCorrect: false },
          { order: 3, text: "20%", isCorrect: true },
          { order: 4, text: "25%", isCorrect: false },
        ],
      },
      {
        order: 2,
        text: "A branch has a monthly sales target of GH¢80,000 and achieves GH¢68,000. What percentage of the target was achieved?",
        points: 1,
        options: [
          { order: 1, text: "80%", isCorrect: false },
          { order: 2, text: "82.5%", isCorrect: false },
          { order: 3, text: "85%", isCorrect: true },
          { order: 4, text: "90%", isCorrect: false },
        ],
      },
      {
        order: 3,
        text: "A branch serves 1,500 customers in a month and records sales of GH¢75,000. What is the average amount spent per customer?",
        points: 1,
        options: [
          { order: 1, text: "GH¢40", isCorrect: false },
          { order: 2, text: "GH¢45", isCorrect: false },
          { order: 3, text: "GH¢50", isCorrect: true },
          { order: 4, text: "GH¢55", isCorrect: false },
        ],
      },
      {
        order: 4,
        text: "A restaurant purchases food items worth GH¢12,000 and sells the resulting products for GH¢18,000. What is the gross profit?",
        points: 1,
        options: [
          { order: 1, text: "GH¢4,000", isCorrect: false },
          { order: 2, text: "GH¢5,000", isCorrect: false },
          { order: 3, text: "GH¢6,000", isCorrect: true },
          { order: 4, text: "GH¢7,000", isCorrect: false },
        ],
      },
      {
        order: 5,
        text: "A branch's sales are GH¢60,000 and its operating expenses are GH¢18,000. What percentage of sales represents operating expenses?",
        points: 1,
        options: [
          { order: 1, text: "20%", isCorrect: false },
          { order: 2, text: "25%", isCorrect: false },
          { order: 3, text: "30%", isCorrect: true },
          { order: 4, text: "35%", isCorrect: false },
        ],
      },
      {
        order: 6,
        text: "A branch records the following daily sales: Monday – GH¢4,000, Tuesday – GH¢5,000, Wednesday – GH¢3,000, Thursday – GH¢6,000, Friday – GH¢7,000. What is the average daily sales?",
        points: 1,
        options: [
          { order: 1, text: "GH¢4,500", isCorrect: false },
          { order: 2, text: "GH¢5,000", isCorrect: true },
          { order: 3, text: "GH¢5,500", isCorrect: false },
          { order: 4, text: "GH¢6,000", isCorrect: false },
        ],
      },
      {
        order: 7,
        text: "A branch's monthly sales increase from GH¢50,000 to GH¢62,500. What is the percentage increase?",
        points: 1,
        options: [
          { order: 1, text: "20%", isCorrect: false },
          { order: 2, text: "22.5%", isCorrect: false },
          { order: 3, text: "25%", isCorrect: true },
          { order: 4, text: "30%", isCorrect: false },
        ],
      },
      {
        order: 8,
        text: "A branch has 20 employees. If 15% are absent on a particular day, how many employees are absent?",
        points: 1,
        options: [
          { order: 1, text: "2", isCorrect: false },
          { order: 2, text: "3", isCorrect: true },
          { order: 3, text: "4", isCorrect: false },
          { order: 4, text: "5", isCorrect: false },
        ],
      },
      {
        order: 9,
        text: "A branch's food cost is GH¢30,000 and represents 40% of its sales. What are the total sales?",
        points: 1,
        options: [
          { order: 1, text: "GH¢60,000", isCorrect: false },
          { order: 2, text: "GH¢65,000", isCorrect: false },
          { order: 3, text: "GH¢70,000", isCorrect: false },
          { order: 4, text: "GH¢75,000", isCorrect: true },
        ],
      },
      {
        order: 10,
        text: "A business records GH¢100,000 in sales. If sales increase by 10% in the following month and then decrease by 10% the month after, what are the sales in the second month?",
        points: 1,
        options: [
          { order: 1, text: "GH¢90,000", isCorrect: false },
          { order: 2, text: "GH¢99,000", isCorrect: true },
          { order: 3, text: "GH¢100,000", isCorrect: false },
          { order: 4, text: "GH¢101,000", isCorrect: false },
        ],
      },
    ],
  },
  {
    title: "Leadership",
    description: "10 questions | 10 minutes",
    order: 3,
    timeLimitMinutes: 10,
    questions: [
      {
        order: 1,
        text: "You are supervising a branch and notice that an employee consistently arrives late. What is the most appropriate first step?",
        points: 1,
        options: [
          { order: 1, text: "Immediately dismiss the employee", isCorrect: false },
          { order: 2, text: "Ignore the behaviour", isCorrect: false },
          { order: 3, text: "Discuss the issue with the employee, establish the reason and address it appropriately", isCorrect: true },
          { order: 4, text: "Reduce the employee's salary without discussion", isCorrect: false },
        ],
      },
      {
        order: 2,
        text: "Your team is behind target halfway through the month. What should you do first?",
        points: 1,
        options: [
          { order: 1, text: "Blame the team", isCorrect: false },
          { order: 2, text: "Analyse the performance gap and identify what is causing it", isCorrect: true },
          { order: 3, text: "Increase everyone's working hours immediately", isCorrect: false },
          { order: 4, text: "Wait until the end of the month", isCorrect: false },
        ],
      },
      {
        order: 3,
        text: "Two employees have a disagreement that is affecting their work. As a supervisor, what should you do?",
        points: 1,
        options: [
          { order: 1, text: "Take sides immediately", isCorrect: false },
          { order: 2, text: "Ignore the issue", isCorrect: false },
          { order: 3, text: "Listen to both sides, establish the facts and work toward a fair resolution", isCorrect: true },
          { order: 4, text: "Transfer both employees immediately", isCorrect: false },
        ],
      },
      {
        order: 4,
        text: "You discover that a team member made a serious mistake in a report. What is the best leadership response?",
        points: 1,
        options: [
          { order: 1, text: "Publicly embarrass the employee", isCorrect: false },
          { order: 2, text: "Hide the mistake", isCorrect: false },
          { order: 3, text: "Correct the issue, understand the cause and coach the employee to prevent recurrence", isCorrect: true },
          { order: 4, text: "Immediately remove the employee from the team", isCorrect: false },
        ],
      },
      {
        order: 5,
        text: "Your team performs well when you are present but performance drops when you leave. What does this suggest you should focus on?",
        points: 1,
        options: [
          { order: 1, text: "Working longer hours yourself", isCorrect: false },
          { order: 2, text: "Building accountability and ownership within the team", isCorrect: true },
          { order: 3, text: "Increasing punishment", isCorrect: false },
          { order: 4, text: "Avoiding delegation", isCorrect: false },
        ],
      },
      {
        order: 6,
        text: "A high-performing employee refuses to follow an important company procedure because they believe their own method is better. What should you do?",
        points: 1,
        options: [
          { order: 1, text: "Allow them to continue because they perform well", isCorrect: false },
          { order: 2, text: "Ignore the issue", isCorrect: false },
          { order: 3, text: "Explain the importance of the procedure and address the non-compliance appropriately", isCorrect: true },
          { order: 4, text: "Immediately dismiss them", isCorrect: false },
        ],
      },
      {
        order: 7,
        text: "You have several urgent tasks and limited staff. What is the best approach?",
        points: 1,
        options: [
          { order: 1, text: "Attempt everything at once", isCorrect: false },
          { order: 2, text: "Prioritize tasks based on urgency and business impact and allocate resources accordingly", isCorrect: true },
          { order: 3, text: "Leave the tasks until the next day", isCorrect: false },
          { order: 4, text: "Give all tasks to one employee", isCorrect: false },
        ],
      },
      {
        order: 8,
        text: "A supervisor notices that one employee is consistently performing poorly while the rest of the team is meeting expectations. What should the supervisor do?",
        points: 1,
        options: [
          { order: 1, text: "Ignore the employee", isCorrect: false },
          { order: 2, text: "Investigate the performance gap, provide feedback and support, and monitor improvement", isCorrect: true },
          { order: 3, text: "Reduce the employee's responsibilities without discussion", isCorrect: false },
          { order: 4, text: "Blame the entire team", isCorrect: false },
        ],
      },
      {
        order: 9,
        text: "Management introduces a new performance target that employees believe is difficult to achieve. What should a good supervisor do?",
        points: 1,
        options: [
          { order: 1, text: "Reject the target immediately", isCorrect: false },
          { order: 2, text: "Communicate the target clearly, understand the concerns and develop a practical plan to work toward it", isCorrect: true },
          { order: 3, text: "Tell employees that their concerns do not matter", isCorrect: false },
          { order: 4, text: "Ignore the target", isCorrect: false },
        ],
      },
      {
        order: 10,
        text: "You are promoted to supervise a team that includes people who have worked at the company longer than you. What is the most effective approach?",
        points: 1,
        options: [
          { order: 1, text: "Try to prove that you are more knowledgeable than everyone", isCorrect: false },
          { order: 2, text: "Avoid making decisions", isCorrect: false },
          { order: 3, text: "Build credibility through fairness, communication, accountability and consistent performance", isCorrect: true },
          { order: 4, text: "Allow experienced employees to make all decisions", isCorrect: false },
        ],
      },
    ],
  },
];

export async function seedAptitudeAssessmentTest() {
  const title = "Basilissa Family Restaurant Aptitude Assessment Test";
  const description =
    "Duration: 30 minutes (10 minutes per section) | Total Questions: 30\n" +
    "Sections: A) Critical Thinking & Business Analytics, B) Arithmetic, C) Leadership";

  // Check if test with this title already exists
  const existing = await prisma.aptitudeTest.findFirst({
    where: {
      title,
      deletedAt: null,
    },
  });

  if (existing) {
    console.log(
      `Aptitude test "${title}" already exists (ID: ${existing.id}, Status: ${existing.status}). Skipping creation.`,
    );
    return existing;
  }

  // Create test in DRAFT status (NOT PUBLISHED)
  const created = await prisma.aptitudeTest.create({
    data: {
      title,
      description,
      status: AptitudeTestStatus.DRAFT, // Deliberately DRAFT, not published
      timeLimitMinutes: 30,
      passMarkPercent: 70,
      showScoreToCandidate: false,
      invitationsExpire: true,
      invitationTtlHours: 168,
      publicLinkEnabled: false,
      publicLinkNameMode: IdentityFieldMode.REQUIRED,
      publicLinkEmailMode: IdentityFieldMode.REQUIRED,
      sections: {
        create: APTITUDE_ASSESSMENT_TEST_SECTIONS.map((section) => ({
          title: section.title,
          description: section.description,
          order: section.order,
          timeLimitMinutes: section.timeLimitMinutes,
          questions: {
            create: section.questions.map((q) => ({
              kind: AptitudeQuestionKind.SINGLE_CHOICE,
              text: q.text,
              order: q.order,
              points: q.points,
              required: true,
              options: {
                create: q.options.map((opt) => ({
                  text: opt.text,
                  order: opt.order,
                  isCorrect: opt.isCorrect,
                })),
              },
            })),
          },
        })),
      },
    },
    include: {
      sections: {
        include: {
          questions: {
            include: { options: true },
          },
        },
      },
    },
  });

  console.log(
    `Successfully created DRAFT test "${title}" (ID: ${created.id}) with ${created.sections.length} sections and 30 questions. (Status: ${created.status})`,
  );
  return created;
}

if (require.main === module || process.argv[1]?.includes("seed-aptitude-assessment-test")) {
  seedAptitudeAssessmentTest()
    .catch((e) => {
      console.error("Seeding failed:", e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
