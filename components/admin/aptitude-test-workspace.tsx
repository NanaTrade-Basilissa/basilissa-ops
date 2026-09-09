"use client";

import { ClipboardCheck, Link2, Lock, Settings2, Users } from "lucide-react";
import type { AptitudeQuestionKind, IdentityFieldMode } from "@prisma/client";
import type { AptitudeFormState, BulkInviteState, InviteState } from "@/lib/modules/aptitude/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AptitudeTestBuilder } from "@/components/admin/aptitude-test-builder";
import { AptitudeInvitePanel } from "@/components/admin/aptitude-invite-panel";
import { AptitudePublicLinkPanel } from "@/components/admin/aptitude-public-link-panel";
import { AptitudeTestDetailsForm } from "@/components/admin/aptitude-test-details-form";

type Section = {
  id: string;
  title: string;
  description: string | null;
  questions: {
    id: string;
    kind: AptitudeQuestionKind;
    text: string;
    points: number;
    required: boolean;
    options: { id: string; text: string; isCorrect: boolean }[];
  }[];
};

type Invitation = Parameters<typeof AptitudeInvitePanel>[0]["invitations"][number];

/**
 * Same Questions/Responses/Settings shape as `assessment-workspace.tsx`.
 * The Responses tab shows the two candidate-reach mechanisms side by side —
 * "send by email" (inside AptitudeInvitePanel) and the public link — rather
 * than as a tab choice, since HR wants both available together, not one
 * treated as secondary.
 */
export function AptitudeTestWorkspace({
  isDraft,
  isClosed,
  isPublished,
  canWrite,
  testId,
  sections,
  addSectionAction,
  updateSectionAction,
  addQuestionAction,
  deleteQuestionAction,
  summary,
  invitations,
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
  testId: string;
  sections: Section[];
  addSectionAction: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
  updateSectionAction: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
  addQuestionAction: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
  deleteQuestionAction: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
  summary: { invited: number; submitted: number; averagePercent: number | null };
  invitations: Invitation[];
  inviteAction: (prev: InviteState, formData: FormData) => Promise<InviteState>;
  inviteManyAction: (prev: BulkInviteState, formData: FormData) => Promise<BulkInviteState>;
  resendAction: (prev: InviteState, formData: FormData) => Promise<InviteState>;
  revokeAction: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
  publicLinkAction: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
  publicLinkUrl: string | null;
  publicLinkValues: { enabled: boolean; nameMode: IdentityFieldMode; emailMode: IdentityFieldMode };
  detailsAction: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
  detailsValues: {
    title: string;
    description: string | null;
    showScoreToCandidate: boolean;
    passMarkPercent: number | null;
    invitationsExpire: boolean;
    invitationTtlHours: number;
    timeLimitMinutes: number | null;
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
              Two candidates who sat the same test must be evaluated against the same
              structure, so it cannot change once published. The title and introduction can
              still be edited from Settings.
            </AlertDescription>
          </Alert>
        )}
        <AptitudeTestBuilder
          testId={testId}
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
            <EmptyDescription>Publish this test to start inviting candidates and collecting responses.</EmptyDescription>
          </Empty>
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

            {canWrite && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Link2 className="size-4" />
                    Public link
                  </CardTitle>
                  <CardDescription>
                    The everyday way to reach candidates — one link, shared however you like.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <AptitudePublicLinkPanel action={publicLinkAction} linkUrl={publicLinkUrl} values={publicLinkValues} />
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="size-4" />
                  Who has it
                </CardTitle>
                <CardDescription>
                  Send a personal link by email when you already have a candidate&rsquo;s
                  address, one at a time or several at once.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AptitudeInvitePanel
                  testId={testId}
                  canWrite={canWrite}
                  invitations={invitations}
                  inviteAction={inviteAction}
                  inviteManyAction={inviteManyAction}
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
          <AptitudeTestDetailsForm action={detailsAction} submitLabel="Save details" values={detailsValues} />
        ) : (
          <Empty className="border">
            <EmptyDescription>
              {isClosed
                ? "This test is closed. Settings can no longer be changed."
                : "You can view this test but not change its settings."}
            </EmptyDescription>
          </Empty>
        )}
      </TabsContent>
    </Tabs>
  );
}
