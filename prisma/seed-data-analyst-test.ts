import {
  PrismaClient,
  AptitudeTestStatus,
  AptitudeQuestionKind,
  IdentityFieldMode,
} from "@prisma/client";
import crypto from "node:crypto";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

export const DATA_ANALYST_TEST_SECTIONS = [
  {
    "title": "Numerical & Quantitative Reasoning",
    "description": null,
    "order": 1,
    "questions": [
      {
        "order": 1,
        "text": "A restaurant recorded the following monthly sales: January \u2013 GH\u00a245,000; February \u2013 GH\u00a250,000; March \u2013 GH\u00a255,000. What was the percentage increase in sales from January to March?",
        "points": 1,
        "options": [
          {
            "order": 1,
            "text": "10%",
            "isCorrect": false
          },
          {
            "order": 2,
            "text": "15%",
            "isCorrect": false
          },
          {
            "order": 3,
            "text": "22.2%",
            "isCorrect": true
          },
          {
            "order": 4,
            "text": "25%",
            "isCorrect": false
          }
        ],
        "correctLetter": "C"
      },
      {
        "order": 2,
        "text": "A branch has a monthly sales target of GH\u00a280,000 but achieved GH\u00a272,000. What percentage of the target was achieved?",
        "points": 1,
        "options": [
          {
            "order": 1,
            "text": "80%",
            "isCorrect": false
          },
          {
            "order": 2,
            "text": "85%",
            "isCorrect": false
          },
          {
            "order": 3,
            "text": "90%",
            "isCorrect": true
          },
          {
            "order": 4,
            "text": "95%",
            "isCorrect": false
          }
        ],
        "correctLetter": "C"
      },
      {
        "order": 3,
        "text": "A company had 250 employees at the beginning of the year and 275 at the end of the year. What was the percentage increase?",
        "points": 1,
        "options": [
          {
            "order": 1,
            "text": "5%",
            "isCorrect": false
          },
          {
            "order": 2,
            "text": "8%",
            "isCorrect": false
          },
          {
            "order": 3,
            "text": "10%",
            "isCorrect": true
          },
          {
            "order": 4,
            "text": "12%",
            "isCorrect": false
          }
        ],
        "correctLetter": "C"
      },
      {
        "order": 4,
        "text": "The average sales for four branches are: Tema Mall \u2013 GH\u00a250,000; Accra Mall \u2013 GH\u00a265,000; Achimota \u2013 GH\u00a255,000; West Hills \u2013 GH\u00a270,000. What is the average sales figure?",
        "points": 1,
        "options": [
          {
            "order": 1,
            "text": "GH\u00a255,000",
            "isCorrect": false
          },
          {
            "order": 2,
            "text": "GH\u00a257,500",
            "isCorrect": false
          },
          {
            "order": 3,
            "text": "GH\u00a260,000",
            "isCorrect": true
          },
          {
            "order": 4,
            "text": "GH\u00a262,500",
            "isCorrect": false
          }
        ],
        "correctLetter": "C"
      },
      {
        "order": 5,
        "text": "A branch's sales increased from GH\u00a240,000 to GH\u00a248,000. What was the absolute increase?",
        "points": 1,
        "options": [
          {
            "order": 1,
            "text": "GH\u00a26,000",
            "isCorrect": false
          },
          {
            "order": 2,
            "text": "GH\u00a28,000",
            "isCorrect": true
          },
          {
            "order": 3,
            "text": "GH\u00a210,000",
            "isCorrect": false
          },
          {
            "order": 4,
            "text": "GH\u00a212,000",
            "isCorrect": false
          }
        ],
        "correctLetter": "B"
      }
    ]
  },
  {
    "title": "Data Interpretation",
    "description": "Use the table below to answer Questions 6\u201310:\n\nBranch     | January   | February  | March\n---------- | --------- | --------- | ---------\nTema       | GH\u00a240,000 | GH\u00a245,000 | GH\u00a250,000\nAccra      | GH\u00a260,000 | GH\u00a255,000 | GH\u00a265,000\nAchimota   | GH\u00a235,000 | GH\u00a240,000 | GH\u00a238,000\nWest Hills | GH\u00a250,000 | GH\u00a252,000 | GH\u00a260,000",
    "order": 2,
    "questions": [
      {
        "order": 1,
        "text": "Which branch recorded the highest sales in March?",
        "points": 1,
        "options": [
          {
            "order": 1,
            "text": "Tema",
            "isCorrect": false
          },
          {
            "order": 2,
            "text": "Accra",
            "isCorrect": true
          },
          {
            "order": 3,
            "text": "Achimota",
            "isCorrect": false
          },
          {
            "order": 4,
            "text": "West Hills",
            "isCorrect": false
          }
        ],
        "correctLetter": "B"
      },
      {
        "order": 2,
        "text": "Which branch experienced the largest increase between January and March?",
        "points": 1,
        "options": [
          {
            "order": 1,
            "text": "Tema",
            "isCorrect": true
          },
          {
            "order": 2,
            "text": "Accra",
            "isCorrect": false
          },
          {
            "order": 3,
            "text": "Achimota",
            "isCorrect": false
          },
          {
            "order": 4,
            "text": "West Hills",
            "isCorrect": false
          }
        ],
        "correctLetter": "A"
      },
      {
        "order": 3,
        "text": "What were the total sales for Tema across the three months?",
        "points": 1,
        "options": [
          {
            "order": 1,
            "text": "GH\u00a2125,000",
            "isCorrect": false
          },
          {
            "order": 2,
            "text": "GH\u00a2130,000",
            "isCorrect": false
          },
          {
            "order": 3,
            "text": "GH\u00a2135,000",
            "isCorrect": true
          },
          {
            "order": 4,
            "text": "GH\u00a2140,000",
            "isCorrect": false
          }
        ],
        "correctLetter": "C"
      },
      {
        "order": 4,
        "text": "Which branch had the lowest total sales over the three months?",
        "points": 1,
        "options": [
          {
            "order": 1,
            "text": "Tema",
            "isCorrect": false
          },
          {
            "order": 2,
            "text": "Accra",
            "isCorrect": false
          },
          {
            "order": 3,
            "text": "Achimota",
            "isCorrect": true
          },
          {
            "order": 4,
            "text": "West Hills",
            "isCorrect": false
          }
        ],
        "correctLetter": "C"
      },
      {
        "order": 5,
        "text": "In which month were total sales across all four branches highest?",
        "points": 1,
        "options": [
          {
            "order": 1,
            "text": "January",
            "isCorrect": false
          },
          {
            "order": 2,
            "text": "February",
            "isCorrect": false
          },
          {
            "order": 3,
            "text": "March",
            "isCorrect": true
          },
          {
            "order": 4,
            "text": "January and February",
            "isCorrect": false
          }
        ],
        "correctLetter": "C"
      }
    ]
  },
  {
    "title": "Basic Statistics",
    "description": null,
    "order": 3,
    "questions": [
      {
        "order": 1,
        "text": "What is the mean of the following numbers?\n10, 15, 20, 25, 30",
        "points": 1,
        "options": [
          {
            "order": 1,
            "text": "18",
            "isCorrect": false
          },
          {
            "order": 2,
            "text": "20",
            "isCorrect": true
          },
          {
            "order": 3,
            "text": "22",
            "isCorrect": false
          },
          {
            "order": 4,
            "text": "25",
            "isCorrect": false
          }
        ],
        "correctLetter": "B"
      },
      {
        "order": 2,
        "text": "What is the median of the following values?\n5, 8, 10, 15, 20, 25, 30",
        "points": 1,
        "options": [
          {
            "order": 1,
            "text": "10",
            "isCorrect": false
          },
          {
            "order": 2,
            "text": "15",
            "isCorrect": true
          },
          {
            "order": 3,
            "text": "20",
            "isCorrect": false
          },
          {
            "order": 4,
            "text": "25",
            "isCorrect": false
          }
        ],
        "correctLetter": "B"
      },
      {
        "order": 3,
        "text": "Which measure is most affected by an extremely high or low value?",
        "points": 1,
        "options": [
          {
            "order": 1,
            "text": "Median",
            "isCorrect": false
          },
          {
            "order": 2,
            "text": "Mode",
            "isCorrect": false
          },
          {
            "order": 3,
            "text": "Mean",
            "isCorrect": true
          },
          {
            "order": 4,
            "text": "Range",
            "isCorrect": false
          }
        ],
        "correctLetter": "C"
      },
      {
        "order": 4,
        "text": "A dataset has the values 2, 3, 3, 4, 5, 3, 6. What is the mode?",
        "points": 1,
        "options": [
          {
            "order": 1,
            "text": "2",
            "isCorrect": false
          },
          {
            "order": 2,
            "text": "3",
            "isCorrect": true
          },
          {
            "order": 3,
            "text": "4",
            "isCorrect": false
          },
          {
            "order": 4,
            "text": "6",
            "isCorrect": false
          }
        ],
        "correctLetter": "B"
      },
      {
        "order": 5,
        "text": "What does standard deviation primarily measure?",
        "points": 1,
        "options": [
          {
            "order": 1,
            "text": "The average value",
            "isCorrect": false
          },
          {
            "order": 2,
            "text": "The most common value",
            "isCorrect": false
          },
          {
            "order": 3,
            "text": "The spread/variation of data",
            "isCorrect": true
          },
          {
            "order": 4,
            "text": "The total number of observations",
            "isCorrect": false
          }
        ],
        "correctLetter": "C"
      }
    ]
  },
  {
    "title": "Excel / Spreadsheet Skills",
    "description": null,
    "order": 4,
    "questions": [
      {
        "order": 1,
        "text": "Which Excel formula calculates the average of cells B2 to B10?",
        "points": 1,
        "options": [
          {
            "order": 1,
            "text": "=SUM(B2:B10)",
            "isCorrect": false
          },
          {
            "order": 2,
            "text": "=AVERAGE(B2:B10)",
            "isCorrect": true
          },
          {
            "order": 3,
            "text": "=MEAN(B2:B10)",
            "isCorrect": false
          },
          {
            "order": 4,
            "text": "=TOTAL(B2:B10)",
            "isCorrect": false
          }
        ],
        "correctLetter": "B"
      },
      {
        "order": 2,
        "text": "Which function would you use to count cells containing numbers?",
        "points": 1,
        "options": [
          {
            "order": 1,
            "text": "COUNT",
            "isCorrect": true
          },
          {
            "order": 2,
            "text": "SUM",
            "isCorrect": false
          },
          {
            "order": 3,
            "text": "COUNTA",
            "isCorrect": false
          },
          {
            "order": 4,
            "text": "NUMBER",
            "isCorrect": false
          }
        ],
        "correctLetter": "A"
      },
      {
        "order": 3,
        "text": "What is the main purpose of a PivotTable?",
        "points": 1,
        "options": [
          {
            "order": 1,
            "text": "To create passwords",
            "isCorrect": false
          },
          {
            "order": 2,
            "text": "To summarize and analyze large datasets",
            "isCorrect": true
          },
          {
            "order": 3,
            "text": "To write emails",
            "isCorrect": false
          },
          {
            "order": 4,
            "text": "To format a computer",
            "isCorrect": false
          }
        ],
        "correctLetter": "B"
      },
      {
        "order": 4,
        "text": "Which Excel feature is most useful for identifying duplicate records?",
        "points": 1,
        "options": [
          {
            "order": 1,
            "text": "Freeze Panes",
            "isCorrect": false
          },
          {
            "order": 2,
            "text": "Conditional Formatting",
            "isCorrect": true
          },
          {
            "order": 3,
            "text": "Page Layout",
            "isCorrect": false
          },
          {
            "order": 4,
            "text": "Print Preview",
            "isCorrect": false
          }
        ],
        "correctLetter": "B"
      },
      {
        "order": 5,
        "text": "You have a column containing: Tema, Accra, Tema, Achimota, Tema. Which Excel function could help you determine how many times \"Tema\" appears?",
        "points": 1,
        "options": [
          {
            "order": 1,
            "text": "SUM",
            "isCorrect": false
          },
          {
            "order": 2,
            "text": "COUNTIF",
            "isCorrect": true
          },
          {
            "order": 3,
            "text": "AVERAGE",
            "isCorrect": false
          },
          {
            "order": 4,
            "text": "MAX",
            "isCorrect": false
          }
        ],
        "correctLetter": "B"
      }
    ]
  },
  {
    "title": "Data Cleaning & Quality",
    "description": null,
    "order": 5,
    "questions": [
      {
        "order": 1,
        "text": "You receive a dataset containing the following customer ages: 18, 21, 25, 32, 450, 27. What should you do with the value 450?",
        "points": 1,
        "options": [
          {
            "order": 1,
            "text": "Automatically delete it",
            "isCorrect": false
          },
          {
            "order": 2,
            "text": "Ignore it",
            "isCorrect": false
          },
          {
            "order": 3,
            "text": "Investigate whether it is an error or valid value",
            "isCorrect": true
          },
          {
            "order": 4,
            "text": "Replace it with 25",
            "isCorrect": false
          }
        ],
        "correctLetter": "C"
      },
      {
        "order": 2,
        "text": "A customer appears twice in a dataset with exactly the same customer ID and transaction details. What is this most likely to represent?",
        "points": 1,
        "options": [
          {
            "order": 1,
            "text": "An outlier",
            "isCorrect": false
          },
          {
            "order": 2,
            "text": "A duplicate record",
            "isCorrect": true
          },
          {
            "order": 3,
            "text": "A trend",
            "isCorrect": false
          },
          {
            "order": 4,
            "text": "A correlation",
            "isCorrect": false
          }
        ],
        "correctLetter": "B"
      },
      {
        "order": 3,
        "text": "A dataset contains blank cells in the \"Sales Amount\" column. What should an analyst do FIRST?",
        "points": 1,
        "options": [
          {
            "order": 1,
            "text": "Replace all blanks with zero",
            "isCorrect": false
          },
          {
            "order": 2,
            "text": "Delete the entire column",
            "isCorrect": false
          },
          {
            "order": 3,
            "text": "Investigate why the values are missing",
            "isCorrect": true
          },
          {
            "order": 4,
            "text": "Ignore the blanks",
            "isCorrect": false
          }
        ],
        "correctLetter": "C"
      },
      {
        "order": 4,
        "text": "Why is data validation important?",
        "points": 1,
        "options": [
          {
            "order": 1,
            "text": "It makes spreadsheets look attractive",
            "isCorrect": false
          },
          {
            "order": 2,
            "text": "It helps ensure data is accurate, consistent and follows defined rules",
            "isCorrect": true
          },
          {
            "order": 3,
            "text": "It increases internet speed",
            "isCorrect": false
          },
          {
            "order": 4,
            "text": "It automatically creates reports",
            "isCorrect": false
          }
        ],
        "correctLetter": "B"
      },
      {
        "order": 5,
        "text": "Which of the following is an example of an outlier?",
        "points": 1,
        "options": [
          {
            "order": 1,
            "text": "20, 21, 22, 23, 24",
            "isCorrect": false
          },
          {
            "order": 2,
            "text": "100, 101, 99, 102, 100",
            "isCorrect": false
          },
          {
            "order": 3,
            "text": "10, 11, 12, 13, 80",
            "isCorrect": true
          },
          {
            "order": 4,
            "text": "50, 51, 52, 53, 54",
            "isCorrect": false
          }
        ],
        "correctLetter": "C"
      }
    ]
  },
  {
    "title": "Analytical & Business Thinking",
    "description": null,
    "order": 6,
    "questions": [
      {
        "order": 1,
        "text": "Sales at one branch have declined by 20% for three consecutive months. What should you do FIRST?",
        "points": 1,
        "options": [
          {
            "order": 1,
            "text": "Immediately blame the branch manager",
            "isCorrect": false
          },
          {
            "order": 2,
            "text": "Assume customers no longer like the food",
            "isCorrect": false
          },
          {
            "order": 3,
            "text": "Analyze the data to identify possible causes and patterns",
            "isCorrect": true
          },
          {
            "order": 4,
            "text": "Recommend closing the branch",
            "isCorrect": false
          }
        ],
        "correctLetter": "C"
      },
      {
        "order": 2,
        "text": "A report shows that sales increased by 30%, but the number of customers decreased by 10%. What would be a useful next analysis?",
        "points": 1,
        "options": [
          {
            "order": 1,
            "text": "Ignore the customer data",
            "isCorrect": false
          },
          {
            "order": 2,
            "text": "Investigate whether average transaction value increased",
            "isCorrect": true
          },
          {
            "order": 3,
            "text": "Assume the report is wrong",
            "isCorrect": false
          },
          {
            "order": 4,
            "text": "Delete the sales figures",
            "isCorrect": false
          }
        ],
        "correctLetter": "B"
      },
      {
        "order": 3,
        "text": "Management asks: \u201cWhich branch is performing best?\u201d What information would be most useful before answering?",
        "points": 1,
        "options": [
          {
            "order": 1,
            "text": "The branch with the highest sales only",
            "isCorrect": false
          },
          {
            "order": 2,
            "text": "Sales, targets, costs/profitability and relevant performance indicators",
            "isCorrect": true
          },
          {
            "order": 3,
            "text": "The branch with the most employees",
            "isCorrect": false
          },
          {
            "order": 4,
            "text": "The branch with the largest building",
            "isCorrect": false
          }
        ],
        "correctLetter": "B"
      },
      {
        "order": 4,
        "text": "You identify a trend in the data, but the dataset contains only 10 observations. What should you do?",
        "points": 1,
        "options": [
          {
            "order": 1,
            "text": "Present the trend as a definite fact",
            "isCorrect": false
          },
          {
            "order": 2,
            "text": "Ignore the data completely",
            "isCorrect": false
          },
          {
            "order": 3,
            "text": "Highlight the trend but acknowledge the limited sample size",
            "isCorrect": true
          },
          {
            "order": 4,
            "text": "Add more numbers to make the trend stronger",
            "isCorrect": false
          }
        ],
        "correctLetter": "C"
      },
      {
        "order": 5,
        "text": "Your manager gives you a dataset and asks, \u201cTell me what is happening.\u201d What should your approach be?",
        "points": 1,
        "options": [
          {
            "order": 1,
            "text": "Immediately create a chart",
            "isCorrect": false
          },
          {
            "order": 2,
            "text": "Start deleting unusual data",
            "isCorrect": false
          },
          {
            "order": 3,
            "text": "Understand the business question, clean and analyze the data, then communicate the key findings",
            "isCorrect": true
          },
          {
            "order": 4,
            "text": "Calculate the average and stop there",
            "isCorrect": false
          }
        ],
        "correctLetter": "C"
      }
    ]
  }
] as const;

export async function seedDataAnalystAptitudeTest() {
  console.log("Seeding Basilissa Data Analyst Aptitude Test...");

  // 1. Soft-delete old dummy test if present
  await prisma.aptitudeTest.updateMany({
    where: {
      title: "Data analyst",
      description: "just a test",
      deletedAt: null,
    },
    data: {
      deletedAt: new Date(),
    },
  });

  const title = "Data Analyst Aptitude Test";
  const existing = await prisma.aptitudeTest.findFirst({
    where: { title, deletedAt: null },
    include: {
      invitations: {
        include: { attempt: true },
      },
    },
  });

  if (existing) {
    const hasAttempts = existing.invitations.some((inv) => inv.attempt !== null);
    if (hasAttempts) {
      console.log(
        `Test "${title}" already exists with ID ${existing.id} and has active attempts. Leaving structure untouched.`,
      );
      return existing;
    }

    console.log(`Test "${title}" exists with ID ${existing.id} without attempts. Rebuilding questions/sections...`);
    // Delete existing sections to recreate cleanly
    await prisma.aptitudeSection.deleteMany({
      where: { testId: existing.id },
    });

    const updated = await prisma.aptitudeTest.update({
      where: { id: existing.id },
      data: {
        description: "Basilissa Family Restaurant — Pre-screening assessment for Data Analyst candidates.",
        status: AptitudeTestStatus.PUBLISHED,
        publishedAt: existing.publishedAt ?? new Date(),
        passMarkPercent: 70,
        timeLimitMinutes: 45,
        showScoreToCandidate: false,
        invitationsExpire: true,
        invitationTtlHours: 168,
        publicLinkEnabled: true,
        publicLinkToken: existing.publicLinkToken ?? crypto.randomBytes(16).toString("hex"),
        publicLinkNameMode: IdentityFieldMode.REQUIRED,
        publicLinkEmailMode: IdentityFieldMode.REQUIRED,
        sections: {
          create: DATA_ANALYST_TEST_SECTIONS.map((section) => ({
            title: section.title,
            description: section.description,
            order: section.order,
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

    console.log(`Successfully updated "${title}" (ID: ${updated.id}) with 6 sections and 30 questions.`);
    return updated;
  }

  const created = await prisma.aptitudeTest.create({
    data: {
      title,
      description: "Basilissa Family Restaurant — Pre-screening assessment for Data Analyst candidates.",
      status: AptitudeTestStatus.PUBLISHED,
      publishedAt: new Date(),
      passMarkPercent: 70,
      timeLimitMinutes: 45,
      showScoreToCandidate: false,
      invitationsExpire: true,
      invitationTtlHours: 168,
      publicLinkEnabled: true,
      publicLinkToken: crypto.randomBytes(16).toString("hex"),
      publicLinkNameMode: IdentityFieldMode.REQUIRED,
      publicLinkEmailMode: IdentityFieldMode.REQUIRED,
      sections: {
        create: DATA_ANALYST_TEST_SECTIONS.map((section) => ({
          title: section.title,
          description: section.description,
          order: section.order,
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

  console.log(`Successfully created and published "${title}" (ID: ${created.id}) with 6 sections and 30 questions.`);
  return created;
}

if (require.main === module || process.argv[1]?.includes("seed-data-analyst-test")) {
  seedDataAnalystAptitudeTest()
    .catch((e) => {
      console.error("Seeding failed:", e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
