"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Mail,
  RotateCw,
  Send,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { sendCandidateAptitudeResultAction } from "@/lib/modules/aptitude/actions";

export function CandidateResultDispatchCard({
  attemptId,
  candidateName,
  candidateEmail,
  scoredPoints,
  maxPoints,
  percent,
  passMark,
  submittedAt,
  canWrite,
}: {
  attemptId: string;
  candidateName: string;
  candidateEmail: string | null;
  scoredPoints: number | null;
  maxPoints: number | null;
  percent: number | null;
  passMark: number | null;
  submittedAt: Date | null;
  canWrite: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [emailInput, setEmailInput] = useState(candidateEmail || "");
  const [isPending, startTransition] = useTransition();
  const [lastSentTo, setLastSentTo] = useState<string | null>(null);

  const passed = passMark !== null && percent !== null ? percent >= passMark : null;

  const handleSendResult = () => {
    if (!emailInput || !emailInput.includes("@")) {
      toast.error("Please enter a valid candidate email address");
      return;
    }

    startTransition(async () => {
      try {
        const res = await sendCandidateAptitudeResultAction(attemptId, {
          overrideEmail: emailInput.trim(),
        });

        if (res.success) {
          toast.success(`Official test results sent to ${res.sentTo}`);
          setLastSentTo(res.sentTo || emailInput);
          setDialogOpen(false);
        } else {
          toast.error(res.error ?? "Failed to send candidate results");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error sending results");
      }
    });
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="size-4 text-primary" />
              Candidate Result & Dispatch
            </CardTitle>
            <CardDescription className="text-xs">
              Official score record and candidate email delivery.
            </CardDescription>
          </div>
          {passed !== null && (
            <Badge
              variant={passed ? "default" : "destructive"}
              className="text-xs font-semibold"
            >
              {passed ? "Passed" : "Did Not Pass"}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-heading text-3xl font-bold text-foreground">
                {scoredPoints} / {maxPoints}
              </p>
              {percent !== null && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  <span className="font-semibold text-foreground">{percent}%</span>
                  {passMark !== null && (
                    <>
                      {" · "}
                      <span className={passed ? "text-emerald-600 font-medium" : "text-destructive font-medium"}>
                        {passed ? `met the ${passMark}% pass mark` : `below the ${passMark}% pass mark`}
                      </span>
                    </>
                  )}
                </p>
              )}
            </div>

            {canWrite && submittedAt && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setEmailInput(lastSentTo || candidateEmail || "");
                    setDialogOpen(true);
                  }}
                  className="gap-1.5 text-xs h-9"
                >
                  <Send className="size-3.5" />
                  {lastSentTo ? "Resend Results to Candidate" : "Send Results to Candidate"}
                </Button>
              </div>
            )}
          </div>

          <div className="rounded-lg bg-muted/40 p-3 border text-xs flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-0.5">
              <span className="text-muted-foreground block">Recipient Email:</span>
              <span className="font-medium text-foreground">
                {lastSentTo || candidateEmail || "No email on record"}
              </span>
            </div>

            {lastSentTo && (
              <Badge
                variant="outline"
                className="border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 gap-1 text-[11px]"
              >
                <CheckCircle2 className="size-3" />
                Scorecard Dispatched
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Confirmation & Email Edit Modal */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="size-4 text-primary" />
              Send Results to Candidate
            </DialogTitle>
            <DialogDescription className="text-xs">
              This will email the official scorecard and completion details directly to the candidate.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-muted/50 p-3 border text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Candidate:</span>
                <span className="font-semibold text-foreground">{candidateName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Score:</span>
                <span className="font-mono font-bold text-foreground">
                  {scoredPoints} / {maxPoints} ({percent}%)
                </span>
              </div>
              {passMark !== null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pass Mark:</span>
                  <span>{passMark}% ({passed ? "Passed" : "Did Not Pass"})</span>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="candidate-email-input" className="text-xs font-semibold">
                Candidate Email Address:
              </Label>
              <Input
                id="candidate-email-input"
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="candidate@example.com"
                className="text-xs h-9"
              />
              <p className="text-[11px] text-muted-foreground">
                If the email was mistyped originally, you can correct it here before sending.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialogOpen(false)}
              disabled={isPending}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSendResult}
              disabled={isPending || !emailInput.trim()}
              className="gap-1.5 text-xs"
            >
              {isPending ? (
                <>
                  <RotateCw className="size-3.5 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="size-3.5" />
                  Dispatch Scorecard
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
