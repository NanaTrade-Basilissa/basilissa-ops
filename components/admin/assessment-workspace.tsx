"use client";

import { useState } from "react";
import { ClipboardCheck, Link2, Lock, Settings2, Users } from "lucide-react";
import type { AssessmentQuestionKind, IdentityFieldMode } from "@prisma/client";
import type {
  AssessmentFormState,
  BulkInviteState,
  InviteState,
} from "@/lib/modules/assessments/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AssessmentBuilder } from "@/components/admin/assessment-builder";
import { InvitePanel } from "@/components/admin/invite-panel";
import { PublicLinkPanel } from "@/components/admin/public-link-panel";
import { AssessmentDetailsForm } from "@/components/admin/assessment-details-form";

type Section = {
  id: string;
  title: string;
  description: string | null;
  questions: {
    id: string;
    kind: AssessmentQuestionKind;
    text: string;
    points: number;
    required: boolean;
    options: { id: string; text: string; isCorrect: boolean }[];
  }[];
};

type Invitation = Parameters<typeof InvitePanel>[0]["invitations"][number];

const TABS = [
  { id: "questions", label: "Questions", icon: ClipboardCheck },
  { id: "responses", label: "Responses", icon: Users },
  { id: "settings", label: "Settings", icon: Settings2 },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * Everything on the assessment detail page below the persistent header,
 * organised as three workspaces instead of one long scroll. Purely
 * presentational: every prop here is data or a bound Server Action the page
 * already computes — no new fetching, no new routes, no new mutations
 * beyond wiring up `deleteQuestionAction` (which already existed, unused).
 */
export function AssessmentWorkspace({
  isDraft,
  isClosed,
  isPublished,
  canWrite,
  assessmentId,
  sections,
  addSectionAction,
  addQuestionAction,
  deleteQuestionAction,
  summary,
  invitations,
  employees,
  inviteAction,
  inviteManyAction,
  resendAction,
  revokeAction,
  publicLinkAction,
  publicLinkUrl,
  publicLinkValues,
  detailsAction,
  detailsValues,
}: {
  isDraft: boolean;
  isClosed: boolean;
  isPublished: boolean;
  canWrite: boolean;
  assessmentId: string;
  sections: Section[];
  addSectionAction: (prev: AssessmentFormState, formData: FormData) => Promise<AssessmentFormState>;
  addQuestionAction: (prev: AssessmentFormState, formData: FormData) => Promise<AssessmentFormState>;
  deleteQuestionAction: (prev: AssessmentFormState, formData: FormData) => Promise<AssessmentFormState>;
  summary: { invited: number; submitted: number; averagePercent: number | null };
  invitations: Invitation[];
  employees: { id: string; label: string }[];
  inviteAction: (prev: InviteState, formData: FormData) => Promise<InviteState>;
  inviteManyAction: (prev: BulkInviteState, formData: FormData) => Promise<BulkInviteState>;
  resendAction: (prev: InviteState, formData: FormData) => Promise<InviteState>;
  revokeAction: (prev: AssessmentFormState, formData: FormData) => Promise<AssessmentFormState>;
  publicLinkAction: (prev: AssessmentFormState, formData: FormData) => Promise<AssessmentFormState>;
  publicLinkUrl: string | null;
  publicLinkValues: { enabled: boolean; nameMode: IdentityFieldMode; emailMode: IdentityFieldMode };
  detailsAction: (prev: AssessmentFormState, formData: FormData) => Promise<AssessmentFormState>;
  detailsValues: {
    title: string;
    description: string | null;
    showScoreToTaker: boolean;
    passMarkPercent: number | null;
    invitationsExpire: boolean;
    invitationTtlHours: number;
  };
}) {
  const [tab, setTab] = useState<TabId>("questions");

  return (
    <div>
      <nav aria-label="Assessment sections" className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="size-4" />
              {t.label}
            </button>
          );
        })}
      </nav>

      <div className="space-y-6 pt-6">
        {tab === "questions" && (
          <div className="space-y-6">
            {!isDraft && (
              <Alert>
                <Lock className="size-4" />
                <AlertTitle>Questions and scoring are frozen</AlertTitle>
                <AlertDescription>
                  Two employees who take the same assessment must be evaluated against the same assessment structure. Therefore, the assessment structure cannot be changed once it has been published. However, the title and introduction can still be edited from Settings.
                </AlertDescription>
              </Alert>
            )}
            <AssessmentBuilder
              assessmentId={assessmentId}
              editable={canWrite && isDraft}
              sections={sections}
              addSectionAction={addSectionAction}
              addQuestionAction={addQuestionAction}
              deleteQuestionAction={deleteQuestionAction}
            />
          </div>
        )}

        {tab === "responses" && (
          <div className="space-y-6">
            {!isPublished ? (
              <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Publish this assessment to start inviting people and collecting responses.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-6 text-sm">
                  <div>
                    <p className="text-2xl font-semibold text-foreground">{summary.invited}</p>
                    <p className="text-muted-foreground">invited</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-foreground">{summary.submitted}</p>
                    <p className="text-muted-foreground">completed</p>
                  </div>
                  {summary.averagePercent !== null && (
                    <div>
                      <p className="text-2xl font-semibold text-foreground">{summary.averagePercent}%</p>
                      <p className="text-muted-foreground">average</p>
                    </div>
                  )}
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Users className="size-4" />
                      Who has it
                    </CardTitle>
                    <CardDescription>One link per person, so a result is always attributable.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <InvitePanel
                      assessmentId={assessmentId}
                      canWrite={canWrite}
                      employees={employees}
                      invitations={invitations}
                      inviteAction={inviteAction}
                      inviteManyAction={inviteManyAction}
                      resendAction={resendAction}
                      revokeAction={revokeAction}
                    />
                  </CardContent>
                </Card>

                {canWrite && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Link2 className="size-4" />
                        Public link
                      </CardTitle>
                      <CardDescription>An alternative to sending one invitation per person.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <PublicLinkPanel action={publicLinkAction} linkUrl={publicLinkUrl} values={publicLinkValues} />
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        )}

        {tab === "settings" && (
          <div className="space-y-6">
            {canWrite && !isClosed ? (
              <AssessmentDetailsForm action={detailsAction} submitLabel="Save details" values={detailsValues} />
            ) : (
              <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                {isClosed
                  ? "This assessment is closed. Settings can no longer be changed."
                  : "You can view this assessment but not change its settings."}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
