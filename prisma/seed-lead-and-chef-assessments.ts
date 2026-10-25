import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  PrismaClient,
  AptitudeTestStatus,
  AptitudeQuestionKind,
  IdentityFieldMode,
} from "@prisma/client";

// Resolve database URL from environment or .env.local / .env
let databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  const envLocalPath = path.resolve(process.cwd(), ".env.local");
  const envPath = path.resolve(process.cwd(), ".env");
  const targetEnv = fs.existsSync(envLocalPath) ? envLocalPath : fs.existsSync(envPath) ? envPath : null;

  if (targetEnv) {
    const content = fs.readFileSync(targetEnv, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("DATABASE_URL=") && !trimmed.startsWith("#")) {
        databaseUrl = trimmed.replace("DATABASE_URL=", "").trim();
        process.env.DATABASE_URL = databaseUrl;
        break;
      }
    }
  }
}

const prisma = new PrismaClient({
  datasourceUrl: databaseUrl,
});

interface QuestionData {
  order: number;
  text: string;
  points: number;
  options: { order: number; text: string; isCorrect: boolean }[];
}

interface SectionData {
  title: string;
  description: string;
  order: number;
  timeLimitMinutes?: number;
  questions: QuestionData[];
}

interface TestData {
  title: string;
  description: string;
  timeLimitMinutes: number;
  passMarkPercent: number;
  sections: SectionData[];
}

export const CUSTOMER_SERVICE_LEAD_TEST: TestData = {
  title: "Customer Service Lead Assessment",
  description: "Stage 1 · Advanced written test · 40 multiple-choice questions · Leadership-level",
  timeLimitMinutes: 60,
  passMarkPercent: 80,
  sections: [
    {
      title: "Section A: Leadership & People Management",
      description: "Questions 1–8 · 8 marks",
      order: 1,
      questions: [
        {
          order: 1,
          text: "You have just been promoted to lead four CSOs who were your peers. The most experienced one openly questions your instructions in front of the team during a busy shift. What is the best first move?",
          points: 1,
          options: [
            { order: 1, text: "Report her to HR straight after the shift so that management deals with the challenge to your authority", isCorrect: false },
            { order: 2, text: "Correct her firmly in front of the team right away, so that everyone sees clearly who is now in charge and the challenge does not spread to others", isCorrect: false },
            { order: 3, text: "Avoid conflict for the first month and let her run the floor her way until you have earned respect", isCorrect: false },
            { order: 4, text: "Keep the shift moving, then meet her privately: acknowledge her experience, state the standard clearly, agree a role that uses her strengths, and follow up", isCorrect: true },
          ],
        },
        {
          order: 2,
          text: "A skilled, experienced waiter has lost motivation since he was passed over for promotion. His service is still accurate but cold. Using Situational Leadership, which approach fits best?",
          points: 1,
          options: [
            { order: 1, text: "Delegating: low direction, low support. Leave him alone, because he already knows the job", isCorrect: false },
            { order: 2, text: "Supporting: low direction, high support. Listen, involve him in decisions and agree a personal growth goal", isCorrect: true },
            { order: 3, text: "Coaching: high direction, high support. Retrain him on all the basic service steps from the start and check his work closely every shift", isCorrect: false },
            { order: 4, text: "Directing: high direction, low support. Give step-by-step instructions and supervise him closely", isCorrect: false },
          ],
        },
        {
          order: 3,
          text: "Which of these is the best example of corrective feedback using the SBI (Situation-Behaviour-Impact) model?",
          points: 1,
          options: [
            { order: 1, text: '"You are always rude to customers, and it has to stop today or there will be consequences."', isCorrect: false },
            { order: 2, text: '"Some of the team are not greeting customers well, so everyone please try harder from now on."', isCorrect: false },
            { order: 3, text: '"At 1 p.m. yesterday, you served table 4 without greeting them, and they told me they felt ignored. What happened?"', isCorrect: true },
            { order: 4, text: '"You are doing great generally and I appreciate you, but the greeting could be a bit better sometimes, though overall you are fine, okay?"', isCorrect: false },
          ],
        },
        {
          order: 4,
          text: "Saturday mall rush. At the same moment you have: (1) a regular corporate client complaining about a wrong group order, (2) a GH¢40 cash shortage on till 2, (3) staff breaks to schedule, (4) napkins running low. What is the best allocation?",
          points: 1,
          options: [
            { order: 1, text: "Handle the client yourself now; delegate breaks and restocking with clear times; secure till 2 and investigate the shortage with the cashier straight after", isCorrect: true },
            { order: 2, text: "Do all four tasks yourself, one after the other, so that nothing is done to a lower standard by others", isCorrect: false },
            { order: 3, text: "Call the branch manager to take the client and the cash so you can concentrate on breaks and restocking", isCorrect: false },
            { order: 4, text: "Handle the cash shortage first because money matters most and evidence disappears fast, and ask a senior waiter to calm the client and take notes meanwhile", isCorrect: false },
          ],
        },
        {
          order: 5,
          text: "Customer satisfaction (CSAT) at one branch fell from 4.5 to 3.9 out of 5 in one month. What should you do first?",
          points: 1,
          options: [
            { order: 1, text: "Retrain the whole branch team on every service step immediately, starting tomorrow morning, so that standards rise across every shift and every staff member", isCorrect: false },
            { order: 2, text: "Break the feedback down by day, shift, staff member and complaint type to find the root cause before acting", isCorrect: true },
            { order: 3, text: "Move the staff on the weakest-rated shift to other branches and bring in new people to reset the culture", isCorrect: false },
            { order: 4, text: "Offer a discount to every customer who fills in the feedback form so that ratings recover quickly", isCorrect: false },
          ],
        },
        {
          order: 6,
          text: "Your top-selling CSO hits every target but belittles junior staff. Two juniors have resigned and named her as the reason. What should you do?",
          points: 1,
          options: [
            { order: 1, text: "Move the junior staff to a different shift from hers so that the two groups no longer have to work together", isCorrect: false },
            { order: 2, text: "Give her a bonus to show that she is valued by management, then ask her informally over lunch to be a bit kinder and more patient with the new staff", isCorrect: false },
            { order: 3, text: "Leave it alone, because her sales results are far more important to the business than junior staff turnover", isCorrect: false },
            { order: 4, text: "Treat it as a performance issue: give specific feedback, set clear behaviour expectations with consequences, and track it", isCorrect: true },
          ],
        },
        {
          order: 7,
          text: "According to Herzberg's two-factor theory, which of these is most likely to raise long-term motivation, rather than only prevent dissatisfaction?",
          points: 1,
          options: [
            { order: 1, text: "A cleaner, air-conditioned staff room with new lockers and a water dispenser", isCorrect: false },
            { order: 2, text: "Recognition, more responsibility and a clear path for growth", isCorrect: true },
            { order: 3, text: "Being paid correctly and on time every month", isCorrect: false },
            { order: 4, text: "New, better-fitting uniforms for the whole team", isCorrect: false },
          ],
        },
        {
          order: 8,
          text: "You introduce a new digital order-accuracy checklist and the team resists it. Which approach is most likely to succeed?",
          points: 1,
          options: [
            { order: 1, text: "Drop the checklist if most of the team do not like it, because forcing change damages team morale", isCorrect: false },
            { order: 2, text: "Make it compulsory from tomorrow with a penalty for every missed checklist and supervisors inspecting every order, so the change happens quickly and completely", isCorrect: false },
            { order: 3, text: "Explain why using real complaint data, let two respected staff pilot and champion it, then roll it out with training and early wins", isCorrect: true },
            { order: 4, text: "Introduce it only to new recruits so that experienced staff are not disturbed and resistance is avoided", isCorrect: false },
          ],
        },
      ],
    },
    {
      title: "Section B: Service Excellence & Complaint Recovery",
      description: "Questions 9–16 · 8 marks",
      order: 2,
      questions: [
        {
          order: 9,
          text: 'What does the "service recovery paradox" describe?',
          points: 1,
          options: [
            { order: 1, text: "Once a service failure happens, nothing the business does can change the customer's loyalty", isCorrect: false },
            { order: 2, text: "Customers who complain are usually less profitable than customers who never complain", isCorrect: false },
            { order: 3, text: "Recovering from a service failure always costs the business more in refunds and free items than it ever earns back from that customer later", isCorrect: false },
            { order: 4, text: "A customer whose problem is fixed quickly and well can become more loyal than one who never had a problem", isCorrect: true },
          ],
        },
        {
          order: 10,
          text: "A father is shouting at the counter because his family meal has taken 35 minutes. Which sequence follows world-standard complaint handling (HEARD / LAST)?",
          points: 1,
          options: [
            { order: 1, text: "Explain the policy on waiting times → listen → apologise → offer a free drink", isCorrect: false },
            { order: 2, text: "Apologise → explain that the kitchen is very busy today → offer a discount → thank him", isCorrect: false },
            { order: 3, text: "Hear him out → empathise → apologise → resolve with a firm time or remedy → follow up", isCorrect: true },
            { order: 4, text: "Resolve immediately → then listen → explain the company policy → apologise at the end", isCorrect: false },
          ],
        },
        {
          order: 11,
          text: 'A customer writes: "The staff were polite and the place was spotless, but the food came 25 minutes after the time we were promised." Which SERVQUAL dimension failed?',
          points: 1,
          options: [
            { order: 1, text: "Assurance", isCorrect: false },
            { order: 2, text: "Reliability", isCorrect: true },
            { order: 3, text: "Empathy", isCorrect: false },
            { order: 4, text: "Tangibles", isCorrect: false },
          ],
        },
        {
          order: 12,
          text: "A customer asks whether a sauce contains groundnuts because her son is allergic. You are not sure. What should you do?",
          points: 1,
          options: [
            { order: 1, text: "Tell her you will confirm, check the ingredients with the chef, and if you cannot confirm, say so honestly and suggest a safe alternative", isCorrect: true },
            { order: 2, text: "Refuse to serve the family anything at all, because allergies are a risk you cannot accept", isCorrect: false },
            { order: 3, text: "Tell her it is probably fine, because groundnuts are not normally used in that sauce at Basilissa and no customer has ever reacted to it before", isCorrect: false },
            { order: 4, text: "Tell her there are no nuts so that you do not lose the sale, and ask the kitchen to be careful", isCorrect: false },
          ],
        },
        {
          order: 13,
          text: 'In a mall, what is the best-practice way to invite ("push and pull") shoppers into the restaurant?',
          points: 1,
          options: [
            { order: 1, text: "Eye contact, a smile and a short, specific offer (today's combo and price). If they decline, thank them and step back", isCorrect: true },
            { order: 2, text: "Walk alongside shoppers who decline and repeat the offer until they agree to come in", isCorrect: false },
            { order: 3, text: "Hold a menu in front of every passer-by and keep talking about the offers until they stop, look at it and agree to come in", isCorrect: false },
            { order: 4, text: "Stay inside the restaurant and wait, because hungry shoppers will come in by themselves", isCorrect: false },
          ],
        },
        {
          order: 14,
          text: "A customer's shawarma is wrong and she has only 5 minutes before her film starts. What is the best response?",
          points: 1,
          options: [
            { order: 1, text: "Call the manager to approve a replacement before doing anything, so the decision is properly authorised and recorded in line with company procedure", isCorrect: false },
            { order: 2, text: "Refund her money and suggest she comes back another day when she has more time to wait", isCorrect: false },
            { order: 3, text: "Replace it immediately as a priority, pack it to go, add a small gesture within your authority, then log the incident", isCorrect: true },
            { order: 4, text: "Ask her to rejoin the queue so the order is placed correctly through the till like everybody else", isCorrect: false },
          ],
        },
        {
          order: 15,
          text: "A harsh 1-star Google review names one of your staff and is partly inaccurate. What is the best response?",
          points: 1,
          options: [
            { order: 1, text: "Ask friends and staff to post several 5-star reviews quickly so the bad review is pushed down", isCorrect: false },
            { order: 2, text: "Reply publicly within 24 hours: thank them, apologise for the experience without arguing or naming staff, invite them to talk offline, then investigate", isCorrect: true },
            { order: 3, text: "Reply in detail, point by point, correcting each inaccuracy and explaining what really happened, so that other readers know the facts and the staff member's name is cleared", isCorrect: false },
            { order: 4, text: "Ignore it, because responding to negative reviews only draws more attention to the complaint", isCorrect: false },
          ],
        },
        {
          order: 16,
          text: "Research consistently shows that most unhappy customers never complain; they simply leave. What should this mean for how you treat each complaint?",
          points: 1,
          options: [
            { order: 1, text: "Complaints are rare, so each one can be handled quickly and then forgotten", isCorrect: false },
            { order: 2, text: "Customers who do not complain must be satisfied, so focus on the ones who do", isCorrect: false },
            { order: 3, text: "Only serious complaints involving refunds, injuries or managers need to be recorded, reported and analysed", isCorrect: false },
            { order: 4, text: "Treat each complaint as a sign of a wider problem: record it, analyse patterns and fix causes", isCorrect: true },
          ],
        },
      ],
    },
    {
      title: "Section C: Basilissa Standards & Values",
      description: "Questions 17–23 · 7 marks",
      order: 3,
      questions: [
        {
          order: 17,
          text: "What is the official Basilissa slogan?",
          points: 1,
          options: [
            { order: 1, text: "Taste the Premium Difference in Every Single Bite", isCorrect: false },
            { order: 2, text: "Serving Ghana with Love and Premium Taste", isCorrect: false },
            { order: 3, text: "Discipline in Service, Excellence in Taste", isCorrect: true },
            { order: 4, text: "Fast Food, Faster Service, Every Time", isCorrect: false },
          ],
        },
        {
          order: 18,
          text: "Which of these is NOT one of the Basilissa Handbook company values?",
          points: 1,
          options: [
            { order: 1, text: "Customer Centricity", isCorrect: false },
            { order: 2, text: "Faith & Culture", isCorrect: false },
            { order: 3, text: "Ethical Integrity", isCorrect: false },
            { order: 4, text: "Speed Above All", isCorrect: true },
          ],
        },
        {
          order: 19,
          text: 'One of the Basilissa SOP working standards is "360° Communication". In practice it means:',
          points: 1,
          options: [
            { order: 1, text: "Staff should communicate with management only when a serious problem has happened", isCorrect: false },
            { order: 2, text: "All communication should take place on the staff WhatsApp group so that it is recorded", isCorrect: false },
            { order: 3, text: "Only managers and supervisors may speak to customers about problems, so that the message from the business is always consistent and professional", isCorrect: false },
            { order: 4, text: "Information flows up, down and across: staff, kitchen, supervisors and management are kept informed and issues are reported promptly", isCorrect: true },
          ],
        },
        {
          order: 20,
          text: "A customer asks how long her order will take. The kitchen is very busy. What should you tell her?",
          points: 1,
          options: [
            { order: 1, text: '"I don\'t know, it depends on the kitchen", because you cannot control the chefs and do not want to make a promise that may be broken', isCorrect: false },
            { order: 2, text: '"Five minutes", so she stays happy and does not walk out to another restaurant', isCorrect: false },
            { order: 3, text: "An honest time based on the 10-15 minute standard and the current queue, then update her if it changes", isCorrect: true },
            { order: 4, text: "Nothing specific: tell her it is coming and avoid making any promise", isCorrect: false },
          ],
        },
        {
          order: 21,
          text: "A CSO has been late three times this month. Under current Basilissa policy, what applies?",
          points: 1,
          options: [
            { order: 1, text: "No action, as long as the CSO stays late to make up the time", isCorrect: false },
            { order: 2, text: "Immediate dismissal for the third lateness", isCorrect: false },
            { order: 3, text: "Progressive discipline: warnings first, then suspension, then deductions only as the law allows", isCorrect: true },
            { order: 4, text: "An automatic half-day pay deduction for each late arrival, recorded on the attendance sheet", isCorrect: false },
          ],
        },
        {
          order: 22,
          text: "How often are Basilissa staff appraised under current policy?",
          points: 1,
          options: [
            { order: 1, text: "Once a year only", isCorrect: false },
            { order: 2, text: "Monthly, plus an annual appraisal", isCorrect: true },
            { order: 3, text: "Quarterly, in line with the original SOPs", isCorrect: false },
            { order: 4, text: "Every six months", isCorrect: false },
          ],
        },
        {
          order: 23,
          text: "A CSO under you has a grievance about how her shift supervisor treats her. What is the correct route?",
          points: 1,
          options: [
            { order: 1, text: "Post it on the staff WhatsApp group for support", isCorrect: false },
            { order: 2, text: "Raise it with the auditors on their next visit", isCorrect: false },
            { order: 3, text: "Straight to the CEO by phone or email", isCorrect: false },
            { order: 4, text: "Branch Manager, then HR, then CEO", isCorrect: true },
          ],
        },
      ],
    },
    {
      title: "Section D: Commercial Numeracy & Data",
      description: "Questions 24–32 · 9 marks",
      order: 4,
      questions: [
        {
          order: 24,
          text: '200 customers answer "How likely are you to recommend Basilissa?" (0-10). 120 score 9-10, 50 score 7-8, and 30 score 0-6. What is the Net Promoter Score (NPS)?',
          points: 1,
          options: [
            { order: 1, text: "60", isCorrect: false },
            { order: 2, text: "45", isCorrect: true },
            { order: 3, text: "15", isCorrect: false },
            { order: 4, text: "85", isCorrect: false },
          ],
        },
        {
          order: 25,
          text: "A branch serves 400 customers a day with an average spend of GH¢80. If good upselling raises the average spend by GH¢5, how much extra revenue does it make in 30 days?",
          points: 1,
          options: [
            { order: 1, text: "GH¢60,000", isCorrect: true },
            { order: 2, text: "GH¢12,000", isCorrect: false },
            { order: 3, text: "GH¢6,000", isCorrect: false },
            { order: 4, text: "GH¢600,000", isCorrect: false },
          ],
        },
        {
          order: 26,
          text: "In one mall afternoon, 2,000 shoppers walk past. Your CSOs invite 500 of them and 120 come in and buy. What percentage of the invited shoppers became paying customers?",
          points: 1,
          options: [
            { order: 1, text: "24%", isCorrect: true },
            { order: 2, text: "25%", isCorrect: false },
            { order: 3, text: "12%", isCorrect: false },
            { order: 4, text: "6%", isCorrect: false },
          ],
        },
        {
          order: 27,
          text: "A family wants 12 pieces of crispy chicken. Prices: Full (12 pcs) GH¢190, Half (6 pcs) GH¢120, Quarter (3 pcs) GH¢75. How much do they save by buying one Full instead of four Quarters?",
          points: 1,
          options: [
            { order: 1, text: "GH¢120", isCorrect: false },
            { order: 2, text: "GH¢190", isCorrect: false },
            { order: 3, text: "GH¢50", isCorrect: false },
            { order: 4, text: "GH¢110", isCorrect: true },
          ],
        },
        {
          order: 28,
          text: "A Chicken Shawarma sells for GH¢75 and costs GH¢19.74 to make. What is its gross profit percentage?",
          points: 1,
          options: [
            { order: 1, text: "55.3%", isCorrect: false },
            { order: 2, text: "73.7%", isCorrect: true },
            { order: 3, text: "26.3%", isCorrect: false },
            { order: 4, text: "79.7%", isCorrect: false },
          ],
        },
        {
          order: 29,
          text: "Daily sales target: GH¢12,000. The KPI is to reach at least 90% of target. At 6 p.m. sales are GH¢7,800. How much more must you sell before closing to meet the KPI?",
          points: 1,
          options: [
            { order: 1, text: "GH¢4,200", isCorrect: false },
            { order: 2, text: "GH¢10,800", isCorrect: false },
            { order: 3, text: "GH¢3,000", isCorrect: true },
            { order: 4, text: "GH¢1,200", isCorrect: false },
          ],
        },
        {
          order: 30,
          text: "A branch took GH¢18,400 from 230 receipts today. What is the average transaction value?",
          points: 1,
          options: [
            { order: 1, text: "GH¢72", isCorrect: false },
            { order: 2, text: "GH¢80", isCorrect: true },
            { order: 3, text: "GH¢85", isCorrect: false },
            { order: 4, text: "GH¢92.50", isCorrect: false },
          ],
        },
        {
          order: 31,
          text: "On average there are 30 customers inside the restaurant (waiting or eating), and customers arrive at 60 per hour. Using Little's Law, how long does each customer spend inside on average?",
          points: 1,
          options: [
            { order: 1, text: "30 minutes", isCorrect: true },
            { order: 2, text: "60 minutes", isCorrect: false },
            { order: 3, text: "20 minutes", isCorrect: false },
            { order: 4, text: "2 minutes", isCorrect: false },
          ],
        },
        {
          order: 32,
          text: "You normally sell 100 Chicken Shawarmas a day at GH¢75 (cost GH¢19.74). If you offer 10% off, roughly how many MORE must you sell to earn the same total gross profit?",
          points: 1,
          options: [
            { order: 1, text: "About 16 more (116 in total)", isCorrect: true },
            { order: 2, text: "None; volume can stay the same", isCorrect: false },
            { order: 3, text: "About 10 more (110 in total)", isCorrect: false },
            { order: 4, text: "About 26 more (126 in total)", isCorrect: false },
          ],
        },
      ],
    },
    {
      title: "Section E: Judgment, Ethics & Crisis Leadership",
      description: "Questions 33–40 · 8 marks",
      order: 5,
      questions: [
        {
          order: 33,
          text: "You see a cashier, who is also your close friend, void a paid order and put the cash in her pocket. What should you do?",
          points: 1,
          options: [
            { order: 1, text: "Ignore it, because cash control belongs to the cashier and the manager, not to customer service", isCorrect: false },
            { order: 2, text: "Confront her at the till in front of the team so that everyone knows theft will not be tolerated", isCorrect: false },
            { order: 3, text: "Report the facts to the branch manager or audit the same day, without confronting her publicly or touching the evidence", isCorrect: true },
            { order: 4, text: "Talk to her privately after the shift, get the money returned in full, and give her one more chance without reporting, since she is a friend and a first offender", isCorrect: false },
          ],
        },
        {
          order: 34,
          text: "A customer starts choking and cannot speak or cough. What is the right immediate action?",
          points: 1,
          options: [
            { order: 1, text: "Help the customer walk outside for fresh air", isCorrect: false },
            { order: 2, text: "Give the customer some water to drink to help push the food down, and pat them gently on the back until they can breathe again", isCorrect: false },
            { order: 3, text: "Shout for help and emergency services; a trained person gives back blows and abdominal thrusts while others clear space", isCorrect: true },
            { order: 4, text: "Wait for the manager to come and decide what to do", isCorrect: false },
          ],
        },
        {
          order: 35,
          text: "The power and POS system go down at peak time. Twelve customers are waiting. What is the best response?",
          points: 1,
          options: [
            { order: 1, text: "Close the restaurant immediately and politely send all the waiting customers away until the power and the POS system are back on", isCorrect: false },
            { order: 2, text: "Keep taking orders as normal without telling customers that there will be a delay", isCorrect: false },
            { order: 3, text: "Keep taking cash without any receipts and reconcile everything from memory at closing", isCorrect: false },
            { order: 4, text: "Tell customers honestly, prioritise paid orders, switch to numbered manual receipts for later reconciliation, and inform the manager", isCorrect: true },
          ],
        },
        {
          order: 36,
          text: "A customer offers you GH¢50 to have his order prepared ahead of everyone else in the queue. What should you do?",
          points: 1,
          options: [
            { order: 1, text: "Accept the money and share it with the kitchen team so that everyone benefits fairly", isCorrect: false },
            { order: 2, text: "Politely decline to jump the queue, serve him fairly in turn, and follow company policy on any gift or tip", isCorrect: true },
            { order: 3, text: "Call security to remove the customer for trying to bribe a member of staff", isCorrect: false },
            { order: 4, text: "Accept quietly and ask the kitchen to prioritise his order, since it makes the customer happy and he is likely to come back again", isCorrect: false },
          ],
        },
        {
          order: 37,
          text: 'Your manager tells you to inform customers that a sold-out item "will be ready in 5 minutes" so they don\'t leave. What do you do?',
          points: 1,
          options: [
            { order: 1, text: "Refuse loudly in front of the customers so that they understand you are not lying to them", isCorrect: false },
            { order: 2, text: "Tell the customers that the manager asked you to lie to them about the item", isCorrect: false },
            { order: 3, text: "Follow the instruction, because the manager is responsible for the decision, carries the accountability, and staff must obey reasonable instructions at work", isCorrect: false },
            { order: 4, text: "Tell customers the truth and offer an alternative, then raise the instruction respectfully with the manager, escalating if it continues", isCorrect: true },
          ],
        },
        {
          order: 38,
          text: "At the same moment: a customer slips on a wet floor (minor fall), a social-media influencer is waiting for her order, a delivery rider is shouting, and the phone is ringing. What comes first?",
          points: 1,
          options: [
            { order: 1, text: "Attend to the customer who fell and secure the wet area, then delegate the rest", isCorrect: true },
            { order: 2, text: "Answer the phone first, because it could be a large catering order", isCorrect: false },
            { order: 3, text: "Calm the delivery rider first, because he is disturbing all the other customers", isCorrect: false },
            { order: 4, text: "Serve the influencer first, because a single bad post could reach thousands of people and damage all six branches", isCorrect: false },
          ],
        },
        {
          order: 39,
          text: "A man says he is a friend of a woman who ordered earlier and asks for her phone number from the order record. What should you do?",
          points: 1,
          options: [
            { order: 1, text: "Politely decline. Never share customer personal data, but offer to pass his number to her if she returns", isCorrect: true },
            { order: 2, text: "Give it to him, since he knows her name and she has clearly been here before", isCorrect: false },
            { order: 3, text: "Give him only her first name and the area where she lives", isCorrect: false },
            { order: 4, text: "Ask the manager to decide, and give him the number if the manager agrees that he seems genuine and harmless", isCorrect: false },
          ],
        },
        {
          order: 40,
          text: "A customer in a wheelchair arrives with a friend. What is the best-practice way to serve them?",
          points: 1,
          options: [
            { order: 1, text: "Greet and speak directly to the customer, ask how you can help, and offer suitable seating or tray carrying without assuming", isCorrect: true },
            { order: 2, text: "Speak to the friend instead, since the friend is likely to be the one making decisions and it avoids making the customer feel uncomfortable", isCorrect: false },
            { order: 3, text: "Take over and push the wheelchair to a table without asking, to show good service", isCorrect: false },
            { order: 4, text: "Move the customer to a quiet corner so the wheelchair does not block other guests", isCorrect: false },
          ],
        },
      ],
    },
  ],
};

export const CHEF_SELECTION_TEST: TestData = {
  title: "Chef Selection Assessment",
  description: "Stage 1 · Written test · 40 multiple-choice questions",
  timeLimitMinutes: 60,
  passMarkPercent: 70,
  sections: [
    {
      title: "Section A: Leadership & Kitchen Management",
      description: "Questions 1–7 · 7 marks",
      order: 1,
      questions: [
        {
          order: 1,
          text: "During the lunch rush, two cooks start arguing loudly at their stations. As the chef, what should you do first?",
          points: 1,
          options: [
            { order: 1, text: "Calmly separate them, keep the orders moving, and deal with the issue privately after the rush", isCorrect: true },
            { order: 2, text: "Let them settle it themselves and focus on your own station", isCorrect: false },
            { order: 3, text: "Stop all cooking until the argument is resolved in front of everyone", isCorrect: false },
            { order: 4, text: "Leave the kitchen and report both of them straight to HR", isCorrect: false },
          ],
        },
        {
          order: 2,
          text: "A new cook keeps under-portioning chips. What is the best way to correct this?",
          points: 1,
          options: [
            { order: 1, text: "Ignore it, because customers have not complained yet", isCorrect: false },
            { order: 2, text: "Take over the fryer yourself for the rest of the shift", isCorrect: false },
            { order: 3, text: "Show the correct 300 g portion on the scale, let the cook repeat it, then check the next few portions", isCorrect: true },
            { order: 4, text: "Correct the cook loudly in front of the team so everyone learns", isCorrect: false },
          ],
        },
        {
          order: 3,
          text: "One of your cooks is always punctual, accurate with portions and clean. What is the best leadership response?",
          points: 1,
          options: [
            { order: 1, text: "Say nothing; good work is simply what they are paid for", isCorrect: false },
            { order: 2, text: "Ask the cook to slow down so others do not look bad", isCorrect: false },
            { order: 3, text: "Recognise the good work and give the cook the chance to help train others", isCorrect: true },
            { order: 4, text: "Give the cook all the hardest tasks so others can relax", isCorrect: false },
          ],
        },
        {
          order: 4,
          text: "What is the most useful thing to cover in a 5-minute briefing before the shift starts?",
          points: 1,
          options: [
            { order: 1, text: "Yesterday's problems, expected busy periods, stock levels and who is on which station", isCorrect: true },
            { order: 2, text: "Nothing; briefings waste time that could be used for cooking", isCorrect: false },
            { order: 3, text: "Personal news and gossip to lift the mood", isCorrect: false },
            { order: 4, text: "Salary issues and complaints about management", isCorrect: false },
          ],
        },
        {
          order: 5,
          text: "You are one cook short and expect a busy evening. What should you do?",
          points: 1,
          options: [
            { order: 1, text: "Wait and see how busy it gets before doing anything", isCorrect: false },
            { order: 2, text: "Ask the cashier to cook without changing or washing hands", isCorrect: false },
            { order: 3, text: "Quietly remove some menu items without telling anyone", isCorrect: false },
            { order: 4, text: "Inform the manager early, re-plan the stations and do extra prep (mise en place) before the rush", isCorrect: true },
          ],
        },
        {
          order: 6,
          text: "You have 30 orders on the board and three cooks. What is the best way to organise them?",
          points: 1,
          options: [
            { order: 1, text: "Give all the orders to the fastest cook", isCorrect: false },
            { order: 2, text: "Do all 30 orders yourself so they are done correctly", isCorrect: false },
            { order: 3, text: "Assign each cook a station that suits their strength, and check every plate at the pass yourself", isCorrect: true },
            { order: 4, text: "Let everyone work on whichever order they like", isCorrect: false },
          ],
        },
        {
          order: 7,
          text: "Which of these is an example of a chef leading by example?",
          points: 1,
          options: [
            { order: 1, text: "Following every portion measurement and Clean as You Go rule personally, before asking others to", isCorrect: true },
            { order: 2, text: "Using a phone in the kitchen while telling cooks not to", isCorrect: false },
            { order: 3, text: "Tasting food with a spoon and putting the spoon back in the pot", isCorrect: false },
            { order: 4, text: "Arriving late but staying late to make up for it", isCorrect: false },
          ],
        },
      ],
    },
    {
      title: "Section B: Basilissa SOP & Company Standards",
      description: "Questions 8–16 · 9 marks",
      order: 2,
      questions: [
        {
          order: 8,
          text: "According to the Basilissa Chef job description, the Chef reports directly to:",
          points: 1,
          options: [
            { order: 1, text: "The Head of HR", isCorrect: false },
            { order: 2, text: "The Restaurant Manager and Supervisor", isCorrect: true },
            { order: 3, text: "The Auditors", isCorrect: false },
            { order: 4, text: "The Stores team", isCorrect: false },
          ],
        },
        {
          order: 9,
          text: "A cook has a complaint about how they are being treated. What is the correct grievance route at Basilissa?",
          points: 1,
          options: [
            { order: 1, text: "Straight to the CEO", isCorrect: false },
            { order: 2, text: "Branch Manager, then HR, then CEO", isCorrect: true },
            { order: 3, text: "Tell the auditors during their next visit", isCorrect: false },
            { order: 4, text: "Post it on the staff WhatsApp group", isCorrect: false },
          ],
        },
        {
          order: 10,
          text: 'What does the Basilissa "Clean as You Go" policy mean?',
          points: 1,
          options: [
            { order: 1, text: "Leave the cleaning to the cleaners", isCorrect: false },
            { order: 2, text: "Clean and tidy your workstation continuously while you work, not only at closing", isCorrect: true },
            { order: 3, text: "Clean only at the end of the shift", isCorrect: false },
            { order: 4, text: "Clean once a week during general cleaning", isCorrect: false },
          ],
        },
        {
          order: 11,
          text: "How often must the Chef organise a general cleaning in which all kitchen staff take part?",
          points: 1,
          options: [
            { order: 1, text: "Every week", isCorrect: true },
            { order: 2, text: "Every month", isCorrect: false },
            { order: 3, text: "Every day", isCorrect: false },
            { order: 4, text: "Only before an inspection", isCorrect: false },
          ],
        },
        {
          order: 12,
          text: "What is the Basilissa KPI for following portion measurements?",
          points: 1,
          options: [
            { order: 1, text: "90% adherence", isCorrect: false },
            { order: 2, text: "95% adherence", isCorrect: false },
            { order: 3, text: "100% adherence", isCorrect: true },
            { order: 4, text: "80% adherence", isCorrect: false },
          ],
        },
        {
          order: 13,
          text: "What is the target average order preparation time at Basilissa?",
          points: 1,
          options: [
            { order: 1, text: "20 to 30 minutes", isCorrect: false },
            { order: 2, text: "10 to 15 minutes", isCorrect: true },
            { order: 3, text: "Under 5 minutes", isCorrect: false },
            { order: 4, text: "45 minutes", isCorrect: false },
          ],
        },
        {
          order: 14,
          text: "What must every staff member do with their personal phone before starting work?",
          points: 1,
          options: [
            { order: 1, text: "Keep it in the apron pocket on silent", isCorrect: false },
            { order: 2, text: "Hand it to the Manager's phone basket or lock it in their locker", isCorrect: true },
            { order: 3, text: "Keep it on the counter to play music", isCorrect: false },
            { order: 4, text: "Use it only when the kitchen is busy", isCorrect: false },
          ],
        },
        {
          order: 15,
          text: "Stock arrives at your branch from HQ. What must the Chef do before signing?",
          points: 1,
          options: [
            { order: 1, text: "Check only the expensive items like chicken and beef", isCorrect: false },
            { order: 2, text: "Sign first and check the items later", isCorrect: false },
            { order: 3, text: "Let the driver count and sign for you", isCorrect: false },
            { order: 4, text: "Count and check every item against the waybill and report any difference", isCorrect: true },
          ],
        },
        {
          order: 16,
          text: "Which of these is the correct Basilissa chef dress code?",
          points: 1,
          options: [
            { order: 1, text: "Chef's coat, sneakers and visible jewellery", isCorrect: false },
            { order: 2, text: "Clean apron, slippers and a cap", isCorrect: false },
            { order: 3, text: "Any clean T-shirt, sandals and a hairnet", isCorrect: false },
            { order: 4, text: "Clean Basilissa chef's coat, non-slip Crocs, and a chef's hat or hairnet", isCorrect: true },
          ],
        },
      ],
    },
    {
      title: "Section C: Portion Measurements & Arithmetic",
      description: "Questions 17–26 · 10 marks",
      order: 3,
      questions: [
        {
          order: 17,
          text: "How much beef fillet goes into one Basilissa Beef Shawarma?",
          points: 1,
          options: [
            { order: 1, text: "100 g", isCorrect: true },
            { order: 2, text: "150 g", isCorrect: false },
            { order: 3, text: "120 g", isCorrect: false },
            { order: 4, text: "80 g", isCorrect: false },
          ],
        },
        {
          order: 18,
          text: "A customer orders a Half Crispy Chicken. How many pieces should be served?",
          points: 1,
          options: [
            { order: 1, text: "6 pieces", isCorrect: true },
            { order: 2, text: "4 pieces", isCorrect: false },
            { order: 3, text: "8 pieces", isCorrect: false },
            { order: 4, text: "12 pieces", isCorrect: false },
          ],
        },
        {
          order: 19,
          text: "How much cheese goes on a SMALL Beef Pizza?",
          points: 1,
          options: [
            { order: 1, text: "90 g", isCorrect: false },
            { order: 2, text: "190 g", isCorrect: false },
            { order: 3, text: "200 g", isCorrect: false },
            { order: 4, text: "120 g", isCorrect: true },
          ],
        },
        {
          order: 20,
          text: 'What is the correct chips portion for "Chips Only"?',
          points: 1,
          options: [
            { order: 1, text: "200 g (0.2 kg)", isCorrect: false },
            { order: 2, text: "250 g (0.25 kg)", isCorrect: false },
            { order: 3, text: "300 g (0.3 kg)", isCorrect: true },
            { order: 4, text: "500 g (0.5 kg)", isCorrect: false },
          ],
        },
        {
          order: 21,
          text: "One portion of Basilissa Fried Rice uses 0.15 kg of uncooked rice. How much uncooked rice do you need for 40 portions?",
          points: 1,
          options: [
            { order: 1, text: "3 kg", isCorrect: false },
            { order: 2, text: "12 kg", isCorrect: false },
            { order: 3, text: "15 kg", isCorrect: false },
            { order: 4, text: "6 kg", isCorrect: true },
          ],
        },
        {
          order: 22,
          text: "You expect to sell 120 beef shawarmas today. Each uses 100 g of beef fillet. How much beef fillet do you need?",
          points: 1,
          options: [
            { order: 1, text: "1.2 kg", isCorrect: false },
            { order: 2, text: "12 kg", isCorrect: true },
            { order: 3, text: "10 kg", isCorrect: false },
            { order: 4, text: "120 kg", isCorrect: false },
          ],
        },
        {
          order: 23,
          text: "Each shawarma uses 90 g of cabbage. How much cabbage is needed for 50 shawarmas?",
          points: 1,
          options: [
            { order: 1, text: "0.45 kg", isCorrect: false },
            { order: 2, text: "4.5 kg", isCorrect: true },
            { order: 3, text: "45 kg", isCorrect: false },
            { order: 4, text: "9 kg", isCorrect: false },
          ],
        },
        {
          order: 24,
          text: "A Full Crispy Chicken sells for GH¢190 and its food and packaging cost is GH¢60.27. What is the gross profit on one order?",
          points: 1,
          options: [
            { order: 1, text: "GH¢250.27", isCorrect: false },
            { order: 2, text: "GH¢139.73", isCorrect: false },
            { order: 3, text: "GH¢129.73", isCorrect: true },
            { order: 4, text: "GH¢119.73", isCorrect: false },
          ],
        },
        {
          order: 25,
          text: "Cheese costs GH¢168 per kg. A cook adds 50 g of extra cheese to each of 20 pizzas in one day. How much money is lost?",
          points: 1,
          options: [
            { order: 1, text: "GH¢1,680", isCorrect: false },
            { order: 2, text: "GH¢168", isCorrect: true },
            { order: 3, text: "GH¢16.80", isCorrect: false },
            { order: 4, text: "GH¢84", isCorrect: false },
          ],
        },
        {
          order: 26,
          text: "The kitchen produced 200 portions today and 14 were wasted. What is the waste percentage, and is it within the Basilissa target of below 5%?",
          points: 1,
          options: [
            { order: 1, text: "2.8%, within the target", isCorrect: false },
            { order: 2, text: "7%, above the target", isCorrect: true },
            { order: 3, text: "14%, above the target", isCorrect: false },
            { order: 4, text: "5%, within the target", isCorrect: false },
          ],
        },
      ],
    },
    {
      title: "Section D: Problem Solving",
      description: "Questions 27–32 · 6 marks",
      order: 4,
      questions: [
        {
          order: 27,
          text: "During the rush, chips are coming out dark and smell burnt. What should you do?",
          points: 1,
          options: [
            { order: 1, text: "Keep frying to clear the orders and change the oil at closing", isCorrect: false },
            { order: 2, text: "Fry the chips for a shorter time in the same oil", isCorrect: false },
            { order: 3, text: "Add fresh oil on top of the old oil and continue", isCorrect: false },
            { order: 4, text: "Stop frying, check the oil temperature and condition, filter or change the oil as required, and inform the manager", isCorrect: true },
          ],
        },
        {
          order: 28,
          text: "At 6 p.m. you notice the shawarma bread will run out before closing on a busy night. What is the best action?",
          points: 1,
          options: [
            { order: 1, text: "Make the wraps smaller so the bread lasts longer", isCorrect: false },
            { order: 2, text: "Buy bread from the market with your own money without telling anyone", isCorrect: false },
            { order: 3, text: "Inform the manager immediately so an approved emergency request or transfer can be made, and warn the front counter", isCorrect: true },
            { order: 4, text: "Wait until it finishes, then tell customers it is sold out", isCorrect: false },
          ],
        },
        {
          order: 29,
          text: "Chicken: opening stock 25 kg, received 10 kg, closing count 12 kg. Sales records show 21 kg should have been used. How much chicken is unaccounted for?",
          points: 1,
          options: [
            { order: 1, text: "12 kg", isCorrect: false },
            { order: 2, text: "0 kg", isCorrect: false },
            { order: 3, text: "4 kg", isCorrect: false },
            { order: 4, text: "2 kg", isCorrect: true },
          ],
        },
        {
          order: 30,
          text: "A customer complains that their chicken is pink near the bone. What should you do?",
          points: 1,
          options: [
            { order: 1, text: "Apologise and replace it at once, check the core temperature of that batch (at least 75°C), discard or re-cook it, and record and report the incident", isCorrect: true },
            { order: 2, text: "Tell the customer that this is how the chicken is supposed to look", isCorrect: false },
            { order: 3, text: "Give the customer a free drink and do nothing else", isCorrect: false },
            { order: 4, text: "Put the same piece back in the fryer for one minute and return it", isCorrect: false },
          ],
        },
        {
          order: 31,
          text: "At the start of your shift the freezer reads −12°C. What should you do?",
          points: 1,
          options: [
            { order: 1, text: "Ignore it, because −12°C is still below freezing", isCorrect: false },
            { order: 2, text: "Use all the food in it quickly today and say nothing", isCorrect: false },
            { order: 3, text: "Turn the freezer off and on and check again tomorrow", isCorrect: false },
            { order: 4, text: "Report it immediately to the manager and maintenance, move the stock to a working freezer, check whether any food has thawed, and record it", isCorrect: true },
          ],
        },
        {
          order: 32,
          text: "There are 15 tickets waiting and average preparation time has climbed to 25 minutes. What is the best response?",
          points: 1,
          options: [
            { order: 1, text: "Find the station causing the delay, move staff to support it, batch-prepare the best-selling items, and keep the front counter updated", isCorrect: true },
            { order: 2, text: "Stop accepting orders without telling the manager", isCorrect: false },
            { order: 3, text: "Skip portion measuring to speed things up", isCorrect: false },
            { order: 4, text: "Serve items before they are fully cooked", isCorrect: false },
          ],
        },
      ],
    },
    {
      title: "Section E: Hygiene, Health & Safety",
      description: "Questions 33–40 · 8 marks",
      order: 5,
      questions: [
        {
          order: 33,
          text: "How long should you wash your hands with soap and water?",
          points: 1,
          options: [
            { order: 1, text: "About 5 seconds", isCorrect: false },
            { order: 2, text: "At least 2 minutes", isCorrect: false },
            { order: 3, text: "Only until they look clean", isCorrect: false },
            { order: 4, text: "At least 20 seconds", isCorrect: true },
          ],
        },
        {
          order: 34,
          text: 'What is the temperature "danger zone" in which bacteria grow fastest?',
          points: 1,
          options: [
            { order: 1, text: "−18°C to 0°C", isCorrect: false },
            { order: 2, text: "0°C to 5°C", isCorrect: false },
            { order: 3, text: "5°C to 63°C", isCorrect: true },
            { order: 4, text: "63°C to 100°C", isCorrect: false },
          ],
        },
        {
          order: 35,
          text: "What is the correct target temperature for frozen storage?",
          points: 1,
          options: [
            { order: 1, text: "−5°C", isCorrect: false },
            { order: 2, text: "−10°C", isCorrect: false },
            { order: 3, text: "−18°C or below", isCorrect: true },
            { order: 4, text: "0°C", isCorrect: false },
          ],
        },
        {
          order: 36,
          text: "Where should raw chicken be stored in a fridge?",
          points: 1,
          options: [
            { order: 1, text: "On any shelf, as long as the fridge is cold", isCorrect: false },
            { order: 2, text: "On the top shelf so it is easy to reach", isCorrect: false },
            { order: 3, text: "On the bottom shelf, below cooked and ready-to-eat food", isCorrect: true },
            { order: 4, text: "Next to the salad vegetables", isCorrect: false },
          ],
        },
        {
          order: 37,
          text: "A cook has had diarrhoea and vomiting since last night. What should happen?",
          points: 1,
          options: [
            { order: 1, text: "Come to work but wear gloves", isCorrect: false },
            { order: 2, text: "Report it to the supervisor and stay off food handling until 48 hours after the symptoms stop", isCorrect: true },
            { order: 3, text: "Take medicine and continue cooking normally", isCorrect: false },
            { order: 4, text: "Work only on the cashier side for the day", isCorrect: false },
          ],
        },
        {
          order: 38,
          text: "What does FIFO mean in stock rotation?",
          points: 1,
          options: [
            { order: 1, text: "First In, First Out: use older stock before newer stock, checking dates", isCorrect: true },
            { order: 2, text: "Fresh Items First Only", isCorrect: false },
            { order: 3, text: "Freeze It, Fry It Often", isCorrect: false },
            { order: 4, text: "Fast In, Fast Out: use whatever is nearest", isCorrect: false },
          ],
        },
        {
          order: 39,
          text: "A fryer catches fire. What should you do?",
          points: 1,
          options: [
            { order: 1, text: "Switch off the heat and smother the fire with a fire blanket or the correct extinguisher. Never use water", isCorrect: true },
            { order: 2, text: "Throw water on it quickly", isCorrect: false },
            { order: 3, text: "Fan the flames to blow them out", isCorrect: false },
            { order: 4, text: "Carry the fryer outside", isCorrect: false },
          ],
        },
        {
          order: 40,
          text: "You cut your finger while preparing vegetables. What should you do?",
          points: 1,
          options: [
            { order: 1, text: "Ignore it if it is small", isCorrect: false },
            { order: 2, text: "Use a skin-coloured plaster so it is not noticed", isCorrect: false },
            { order: 3, text: "Wrap it in tissue and carry on", isCorrect: false },
            { order: 4, text: "Stop, wash and dry the cut, cover it with a blue waterproof plaster and a glove, and report it", isCorrect: true },
          ],
        },
      ],
    },
  ],
};

async function seedTest(testData: TestData) {
  console.log(`Checking existing test: "${testData.title}"...`);

  const existing = await prisma.aptitudeTest.findFirst({
    where: { title: testData.title, deletedAt: null },
    include: {
      invitations: {
        select: { id: true },
      },
    },
  });

  if (existing) {
    if (existing.invitations.length > 0) {
      console.log(
        `Test "${testData.title}" already has ${existing.invitations.length} invitations/attempts. Preserving existing record (ID: ${existing.id}).`
      );
      return existing;
    }

    console.log(`Test "${testData.title}" exists with 0 attempts. Replacing sections & questions to ensure latest contents...`);
    // Delete existing sections (which cascade deletes questions & options)
    await prisma.aptitudeSection.deleteMany({
      where: { testId: existing.id },
    });

    const updated = await prisma.aptitudeTest.update({
      where: { id: existing.id },
      data: {
        description: testData.description,
        status: AptitudeTestStatus.PUBLISHED,
        timeLimitMinutes: testData.timeLimitMinutes,
        passMarkPercent: testData.passMarkPercent,
        showScoreToCandidate: false,
        invitationsExpire: true,
        invitationTtlHours: 168,
        publicLinkEnabled: true,
        publicLinkToken: existing.publicLinkToken || crypto.randomBytes(16).toString("hex"),
        publicLinkNameMode: IdentityFieldMode.REQUIRED,
        publicLinkEmailMode: IdentityFieldMode.REQUIRED,
        sections: {
          create: testData.sections.map((section) => ({
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

    console.log(`Successfully updated "${updated.title}" (ID: ${updated.id}) with ${updated.sections.length} sections.`);
    return updated;
  }

  const created = await prisma.aptitudeTest.create({
    data: {
      title: testData.title,
      description: testData.description,
      status: AptitudeTestStatus.PUBLISHED,
      publishedAt: new Date(),
      passMarkPercent: testData.passMarkPercent,
      timeLimitMinutes: testData.timeLimitMinutes,
      showScoreToCandidate: false,
      invitationsExpire: true,
      invitationTtlHours: 168,
      publicLinkEnabled: true,
      publicLinkToken: crypto.randomBytes(16).toString("hex"),
      publicLinkNameMode: IdentityFieldMode.REQUIRED,
      publicLinkEmailMode: IdentityFieldMode.REQUIRED,
      sections: {
        create: testData.sections.map((section) => ({
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

  const totalQuestions = created.sections.reduce((acc, s) => acc + s.questions.length, 0);
  console.log(
    `Successfully created and published "${created.title}" (ID: ${created.id}) with ${created.sections.length} sections and ${totalQuestions} questions.`
  );
  return created;
}

export async function seedLeadAndChefAssessments() {
  console.log("Seeding Customer Service Lead Assessment and Chef Selection Assessment...");
  const leadTest = await seedTest(CUSTOMER_SERVICE_LEAD_TEST);
  const chefTest = await seedTest(CHEF_SELECTION_TEST);

  console.log("\n================ SUMMARY ================");
  console.log(`1. ${leadTest.title}:`);
  console.log(`   - ID: ${leadTest.id}`);
  console.log(`   - Pass Mark: ${leadTest.passMarkPercent}%`);
  console.log(`   - Time Limit: ${leadTest.timeLimitMinutes} minutes`);
  console.log(`   - Public Token: ${leadTest.publicLinkToken}`);
  console.log(`   - Candidate Public Link: /aptitude/public/${leadTest.publicLinkToken}`);

  console.log(`\n2. ${chefTest.title}:`);
  console.log(`   - ID: ${chefTest.id}`);
  console.log(`   - Pass Mark: ${chefTest.passMarkPercent}%`);
  console.log(`   - Time Limit: ${chefTest.timeLimitMinutes} minutes`);
  console.log(`   - Public Token: ${chefTest.publicLinkToken}`);
  console.log(`   - Candidate Public Link: /aptitude/public/${chefTest.publicLinkToken}`);
  console.log("=========================================\n");

  return { leadTest, chefTest };
}

if (require.main === module || process.argv[1]?.includes("seed-lead-and-chef-assessments")) {
  seedLeadAndChefAssessments()
    .catch((e) => {
      console.error("Seeding failed:", e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
