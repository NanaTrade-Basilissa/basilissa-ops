"use client";

import { ClipboardCheck, Lock, Settings2 } from "lucide-react";
import type { AptitudeQuestionKind } from "@prisma/client";
import type { AptitudeFormState } from "@/lib/modules/aptitude/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AptitudeTestBuilder } from "@/components/admin/aptitude-test-builder";
import { AptitudeTestDetailsForm } from "@/components/admin/aptitude-test-details-form";

type Section = {
  id: string;
  title: string;
  description: string | null;
  timeLimitMinutes: number | null;
  questions: {
    id: string;
    kind: AptitudeQuestionKind;
    text: string;
    points: number;
    required: boolean;
    options: { id: string; text: string; isCorrect: boolean }[];
  }[];
};

export function AptitudeTestEditor({
  isDraft,
  isClosed,
  canWrite,
  testId,
  sections,
  addSectionAction,
  updateSectionAction,
  addQuestionAction,
  updateQuestionAction,
  deleteQuestionAction,
  detailsAction,
  detailsValues,
}: {
  isDraft: boolean;
  isClosed: boolean;
  canWrite: boolean;
  testId: string;
  sections: Section[];
  addSectionAction: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
  updateSectionAction: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
  addQuestionAction: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
  updateQuestionAction: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
  deleteQuestionAction: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
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
    <Tabs defaultValue="questions" className="space-y-6">
      <TabsList variant="line" className="w-full justify-start rounded-none border-b border-border bg-transparent p-0">
        <TabsTrigger value="questions" className="gap-1.5">
          <ClipboardCheck className="size-4" />
          Questions
        </TabsTrigger>
        <TabsTrigger value="settings" className="gap-1.5">
          <Settings2 className="size-4" />
          Settings
        </TabsTrigger>
      </TabsList>

      <TabsContent value="questions" className="space-y-6 pt-2">
        {!isDraft && (
          <Alert>
            <Lock className="size-4" />
            <AlertTitle>Questions and scoring are frozen</AlertTitle>
            <AlertDescription className="text-xs">
              This test is published, so its questions and scoring structure cannot change.
              Title and details can still be updated in Settings.
            </AlertDescription>
          </Alert>
        )}
        <AptitudeTestBuilder
          testId={testId}
          testTimeLimitMinutes={detailsValues.timeLimitMinutes}
          editable={canWrite && isDraft}
          sections={sections}
          addSectionAction={addSectionAction}
          updateSectionAction={updateSectionAction}
          addQuestionAction={addQuestionAction}
          updateQuestionAction={updateQuestionAction}
          deleteQuestionAction={deleteQuestionAction}
        />
      </TabsContent>

      <TabsContent value="settings" className="space-y-6 pt-2">
        {canWrite && !isClosed ? (
          <AptitudeTestDetailsForm
            action={detailsAction}
            submitLabel="Save details"
            values={detailsValues}
            totalSectionMinutes={sections.reduce((sum, s) => sum + (s.timeLimitMinutes ?? 0), 0)}
          />
        ) : (
          <Empty className="border">
            <EmptyDescription className="text-xs">
              {isClosed
                ? "This test is closed. Settings can no longer be changed."
                : "You can view this test but do not have permission to change its settings."}
            </EmptyDescription>
          </Empty>
        )}
      </TabsContent>
    </Tabs>
  );
}
