"use client";

import { ClipboardCheck, Copy, Lock, Settings2, Users } from "lucide-react";
import { toast } from "sonner";
import type { AssessmentQuestionKind, IdentityFieldMode } from "@prisma/client";
import type {
  AssessmentFormState,
  BulkInviteState,
  InviteState,
} from "@/lib/modules/assessments/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AssessmentBuilder } from "@/components/admin/assessment-builder";
import { InvitePanel } from "@/components/admin/invite-panel";
import { AssessmentInviteDialog } from "@/components/admin/assessment-invite-dialog";
import { AssessmentPublicLinkDialog } from "@/components/admin/assessment-public-link-dialog";
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
  updateSectionAction,
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
  updateSectionAction: (prev: AssessmentFormState, formData: FormData) => Promise<AssessmentFormState>;
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
  return (
    <Tabs defaultValue="questions">
      <TabsList variant="line" className="w-full justify-start rounded-none border-b border-border bg-transparent p-0">
        <TabsTrigger value="questions" className="gap-1.5">
          <ClipboardCheck className="size-4" />
          Questions
        </TabsTrigger>
        <TabsTrigger value="responses" className="gap-1.5">
          <Users className="size-4" />
          Responses
        </TabsTrigger>
        <TabsTrigger value="settings" className="gap-1.5">
          <Settings2 className="size-4" />
          Settings
        </TabsTrigger>
      </TabsList>

      <TabsContent value="questions" className="space-y-6 pt-6">
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
          updateSectionAction={updateSectionAction}
          addQuestionAction={addQuestionAction}
          deleteQuestionAction={deleteQuestionAction}
        />
      </TabsContent>

      <TabsContent value="responses" className="space-y-6 pt-6">
        {!isPublished ? (
          <Empty className="border">
            <EmptyDescription>Publish this assessment to start inviting people and collecting responses.</EmptyDescription>
          </Empty>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
              <div className="flex flex-wrap items-center gap-6 text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-semibold tracking-tight text-foreground">{summary.invited}</span>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">invited</span>
                </div>
                <div className="h-6 w-px bg-border hidden sm:block" />
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-semibold tracking-tight text-foreground">{summary.submitted}</span>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">completed</span>
                </div>
                {summary.averagePercent !== null && (
                  <>
                    <div className="h-6 w-px bg-border hidden sm:block" />
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-semibold tracking-tight text-foreground">{summary.averagePercent}%</span>
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">average</span>
                    </div>
                  </>
                )}
              </div>

              {canWrite && (
                <div className="flex flex-wrap items-center gap-2">
                  {publicLinkValues.enabled && publicLinkUrl && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 gap-1.5"
                      onClick={() => {
                        navigator.clipboard.writeText(publicLinkUrl);
                        toast.success("Public assessment link copied to clipboard");
                      }}
                    >
                      <Copy className="size-4" />
                      Copy public link
                    </Button>
                  )}

                  <AssessmentPublicLinkDialog
                    action={publicLinkAction}
                    linkUrl={publicLinkUrl}
                    values={publicLinkValues}
                  />

                  <AssessmentInviteDialog
                    employees={employees}
                    invitations={invitations}
                    inviteAction={inviteAction}
                    inviteManyAction={inviteManyAction}
                  />
                </div>
              )}
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Users className="size-4" />
                    Participant responses
                  </CardTitle>
                  <CardDescription>
                    Track invitation delivery, employee participation, and assessment scores.
                  </CardDescription>
                </div>
                {publicLinkValues.enabled && (
                  <Badge variant="outline" className="text-xs gap-1.5 py-1">
                    <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Public link active
                  </Badge>
                )}
              </CardHeader>
              <CardContent>
                <InvitePanel
                  assessmentId={assessmentId}
                  canWrite={canWrite}
                  invitations={invitations}
                  resendAction={resendAction}
                  revokeAction={revokeAction}
                />
              </CardContent>
            </Card>
          </>
        )}
      </TabsContent>

      <TabsContent value="settings" className="space-y-6 pt-6">
        {canWrite && !isClosed ? (
          <AssessmentDetailsForm action={detailsAction} submitLabel="Save details" values={detailsValues} />
        ) : (
          <Empty className="border">
            <EmptyDescription>
              {isClosed
                ? "This assessment is closed. Settings can no longer be changed."
                : "You can view this assessment but not change its settings."}
            </EmptyDescription>
          </Empty>
        )}
      </TabsContent>
    </Tabs>
  );
}
