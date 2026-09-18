"use client";

import { ClipboardCheck, Lock, Settings2 } from "lucide-react";
import type { AssessmentQuestionKind } from "@prisma/client";
import type { AssessmentFormState } from "@/lib/modules/assessments/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AssessmentBuilder } from "@/components/admin/assessment-builder";
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

export function AssessmentEditor({
  isDraft,
  isClosed,
  canWrite,
  assessmentId,
  sections,
  addSectionAction,
  updateSectionAction,
  addQuestionAction,
  deleteQuestionAction,
  detailsAction,
  detailsValues,
}: {
  isDraft: boolean;
  isClosed: boolean;
  canWrite: boolean;
  assessmentId: string;
  sections: Section[];
  addSectionAction: (prev: AssessmentFormState, formData: FormData) => Promise<AssessmentFormState>;
  updateSectionAction: (prev: AssessmentFormState, formData: FormData) => Promise<AssessmentFormState>;
  addQuestionAction: (prev: AssessmentFormState, formData: FormData) => Promise<AssessmentFormState>;
  deleteQuestionAction: (prev: AssessmentFormState, formData: FormData) => Promise<AssessmentFormState>;
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
              This assessment is published, so its questions and scoring structure cannot change.
              Title and details can still be updated in Settings.
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

      <TabsContent value="settings" className="space-y-6 pt-2">
        {canWrite && !isClosed ? (
          <AssessmentDetailsForm action={detailsAction} submitLabel="Save details" values={detailsValues} />
        ) : (
          <Empty className="border">
            <EmptyDescription className="text-xs">
              {isClosed
                ? "This assessment is closed. Settings can no longer be changed."
                : "You can view this assessment but do not have permission to change its settings."}
            </EmptyDescription>
          </Empty>
        )}
      </TabsContent>
    </Tabs>
  );
}
