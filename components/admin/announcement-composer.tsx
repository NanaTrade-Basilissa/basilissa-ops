"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Loader2, Megaphone, Send, Smartphone, Users, CheckCheck } from "lucide-react";
import type { FormState } from "@/lib/platform/forms";
import {
  previewAnnouncementAudienceAction,
  sendAnnouncementAction,
} from "@/lib/modules/announcements/actions";
import { REFUSAL_MESSAGES, type AudiencePreview } from "@/lib/modules/announcements/audience";
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_TITLE_MAX,
  AUDIENCE_LABELS,
  BANNER_HOURS,
  DEFAULT_BANNER_HOURS,
  type AudienceKind,
} from "@/lib/modules/announcements/constants";
import type { ComposeOptions } from "@/lib/modules/announcements/queries";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

function toggle(set: Set<string>, id: string, on: boolean): Set<string> {
  const next = new Set(set);
  if (on) next.add(id);
  else next.delete(id);
  return next;
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-destructive">{message}</p> : null;
}

export function AnnouncementComposer({ options }: { options: ComposeOptions }) {
  const [state, formAction, isSending] = useActionState<FormState, FormData>(sendAnnouncementAction, undefined);
  const errors = state?.fieldErrors ?? {};
  const formRef = useRef<HTMLFormElement>(null);

  // Controlled, so a rejected send keeps what was typed: React resets
  // uncontrolled fields after every action.
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<AudienceKind>(options.canSendToAll ? "ALL" : "BRANCHES");
  const [branchIds, setBranchIds] = useState<Set<string>>(new Set());
  const [employeeIds, setEmployeeIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [sendPush, setSendPush] = useState(true);
  const [isUrgent, setIsUrgent] = useState(false);
  const [bannerHours, setBannerHours] = useState<number>(DEFAULT_BANNER_HOURS);
  const [requiresAck, setRequiresAck] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // The count is kept with the audience it was computed for, so choosing a
  // different audience never shows the previous one's number while the new one
  // loads.
  const [preview, setPreview] = useState<{ key: string; result: AudiencePreview } | null>(null);
  const [, startPreview] = useTransition();
  const previewRun = useRef(0);
  const audienceKey = `${kind}|${[...branchIds].sort().join(",")}|${[...employeeIds].sort().join(",")}`;

  const audienceReady =
    kind === "ALL" || (kind === "BRANCHES" && branchIds.size > 0) || (kind === "PEOPLE" && employeeIds.size > 0);

  // The recipient count, refreshed as the audience changes. Debounced, and a
  // stale answer is ignored so a slow response cannot overwrite a newer one.
  useEffect(() => {
    if (!audienceReady) {
      previewRun.current += 1;
      return;
    }
    const run = ++previewRun.current;
    const key = audienceKey;
    const timer = setTimeout(() => {
      startPreview(async () => {
        const result = await previewAnnouncementAudienceAction({
          audienceKind: kind,
          branchIds: [...branchIds],
          employeeIds: [...employeeIds],
        });
        if (run === previewRun.current) setPreview({ key, result });
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [audienceReady, audienceKey, kind, branchIds, employeeIds]);

  const shownPreview = audienceReady && preview?.key === audienceKey ? preview.result : null;

  const filteredPeople = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options.employees;
    return options.employees.filter(
      (employee) =>
        employee.name.toLowerCase().includes(q) ||
        employee.employeeCode.toLowerCase().includes(q) ||
        employee.branchNames.some((name) => name.toLowerCase().includes(q)),
    );
  }, [options.employees, search]);

  function requestSend() {
    // A client-side miss still submits so the server explains it next to the
    // field; only a complete, addressable message gets the confirmation.
    if (!title.trim() || !body.trim() || !shownPreview?.ok) {
      formRef.current?.requestSubmit();
      return;
    }
    setConfirmOpen(true);
  }

  const recipients = shownPreview?.ok ? shownPreview.recipients : 0;

  return (
    <form ref={formRef} action={formAction} className="mx-auto w-full max-w-3xl space-y-6">
      {state?.error && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Message</CardTitle>
          <CardDescription>Staff read this in the app. Keep the title short; it is what a notification shows.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              required
              maxLength={ANNOUNCEMENT_TITLE_MAX}
              placeholder="e.g. Branch closed on Friday"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-invalid={Boolean(errors.title)}
            />
            <FieldError message={errors.title} />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="body">Message</Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {body.length}/{ANNOUNCEMENT_BODY_MAX}
              </span>
            </div>
            <Textarea
              id="body"
              name="body"
              required
              rows={6}
              maxLength={ANNOUNCEMENT_BODY_MAX}
              placeholder="Write what staff need to know."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              aria-invalid={Boolean(errors.body)}
            />
            <FieldError message={errors.body} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Who is it for</CardTitle>
          <CardDescription>{AUDIENCE_LABELS[kind].description}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input type="hidden" name="audienceKind" value={kind} />
          {[...branchIds].map((id) => (
            <input key={id} type="hidden" name="branchIds" value={id} />
          ))}
          {[...employeeIds].map((id) => (
            <input key={id} type="hidden" name="employeeIds" value={id} />
          ))}

          <Tabs value={kind} onValueChange={(value) => setKind(value as AudienceKind)}>
            <TabsList>
              {options.canSendToAll && <TabsTrigger value="ALL">Everyone</TabsTrigger>}
              <TabsTrigger value="BRANCHES">Branches</TabsTrigger>
              <TabsTrigger value="PEOPLE">People</TabsTrigger>
            </TabsList>
          </Tabs>

          {kind === "BRANCHES" && (
            <div className="space-y-2">
              {options.branches.length === 0 ? (
                <p className="text-sm text-muted-foreground">There are no branches you can send to.</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {options.branches.map((branch) => (
                    <li key={branch.id}>
                      <label className="flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm hover:bg-muted/50">
                        <Checkbox
                          checked={branchIds.has(branch.id)}
                          onCheckedChange={(checked) => setBranchIds((current) => toggle(current, branch.id, checked))}
                        />
                        <span>{branch.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <FieldError message={errors.branchIds} />
            </div>
          )}

          {kind === "PEOPLE" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  type="search"
                  placeholder="Search by name, code or branch"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search employees"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEmployeeIds((current) => new Set([...current, ...filteredPeople.map((p) => p.id)]))}
                >
                  Select shown
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setEmployeeIds(new Set())}>
                  Clear
                </Button>
              </div>
              <ul className="max-h-72 divide-y overflow-y-auto rounded-md border">
                {filteredPeople.length === 0 && (
                  <li className="px-3 py-4 text-sm text-muted-foreground">No one matches that search.</li>
                )}
                {filteredPeople.map((employee) => (
                  <li key={employee.id}>
                    <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/50">
                      <Checkbox
                        checked={employeeIds.has(employee.id)}
                        onCheckedChange={(checked) => setEmployeeIds((current) => toggle(current, employee.id, checked))}
                      />
                      <span className="font-medium">{employee.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {employee.employeeCode}
                        {employee.branchNames.length > 0 && ` · ${employee.branchNames.join(", ")}`}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">{employeeIds.size} selected</p>
              <FieldError message={errors.employeeIds} />
            </div>
          )}

          <div
            className="flex min-h-10 items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm"
            aria-live="polite"
          >
            <Users className="size-4 shrink-0 text-muted-foreground" />
            {!audienceReady ? (
              <span className="text-muted-foreground">Choose who it is for to see how many people it reaches.</span>
            ) : !shownPreview ? (
              <span className="text-muted-foreground">Counting…</span>
            ) : shownPreview.ok ? (
              <span>
                Reaches <strong>{shownPreview.recipients}</strong> {shownPreview.recipients === 1 ? "person" : "people"}.{" "}
                {shownPreview.withoutApp === 0
                  ? shownPreview.recipients === 1
                    ? "They have the app."
                    : "All of them have the app."
                  : `${shownPreview.withApp} ${shownPreview.withApp === 1 ? "has" : "have"} the app; ${shownPreview.withoutApp} will not see it on a phone.`}
              </span>
            ) : (
              <span className="text-destructive">
                {shownPreview.error === "NO_RECIPIENTS"
                  ? "Nobody active matches that audience."
                  : REFUSAL_MESSAGES[shownPreview.error]}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How it is delivered</CardTitle>
          <CardDescription>
            Everyone it reaches gets it in the notifications screen of the app, where it stays. Choose whether to
            alert their phone as well.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sendPush && <input type="hidden" name="sendPush" value="on" />}
          <div className="flex items-start gap-3">
            <Switch id="sendPush" checked={sendPush} onChange={(e) => setSendPush(e.target.checked)} />
            <div className="space-y-0.5">
              <Label htmlFor="sendPush" className="flex items-center gap-1.5">
                <Smartphone className="size-4" />
                Push notification
              </Label>
              <p className="text-xs text-muted-foreground">
                A short alert on their phone. People who have not installed the app are not reached.
              </p>
            </div>
          </div>

          <div className="mt-5 flex items-start gap-3">
            <Switch id="requiresAck" name="requiresAck" checked={requiresAck} onChange={(e) => setRequiresAck(e.target.checked)} />
            <div className="space-y-0.5">
              <Label htmlFor="requiresAck" className="flex items-center gap-1.5">
                <CheckCheck className="size-4" />
                Ask staff to confirm they have read it
              </Label>
              <p className="text-xs text-muted-foreground">
                They get an &ldquo;I&apos;ve read this&rdquo; button, and you see who has not tapped it.
              </p>
            </div>
          </div>

          {options.canSendToAll && (
            <div className="mt-5 flex items-start gap-3">
              <Switch id="isUrgent" name="isUrgent" checked={isUrgent} onChange={(e) => setIsUrgent(e.target.checked)} />
              <div className="flex-1 space-y-1.5">
                <div className="space-y-0.5">
                  <Label htmlFor="isUrgent" className="flex items-center gap-1.5">
                    <Megaphone className="size-4" />
                    Urgent: pin a banner in the app
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Shown at the top of the app to everyone it reaches. Only one banner is up at a time.
                  </p>
                </div>
                {isUrgent && (
                  <>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Keep the banner for</span>
                      <NativeSelect
                        name="bannerHours"
                        value={bannerHours}
                        onChange={(e) => setBannerHours(Number(e.target.value))}
                        className="w-32"
                      >
                        {BANNER_HOURS.map((hours) => (
                          <option key={hours} value={hours}>
                            {hours < 24 ? `${hours} hours` : `${hours / 24} ${hours === 24 ? "day" : "days"}`}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                    {options.activeUrgent && (
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        This replaces the banner that is up now: &ldquo;{options.activeUrgent.title}&rdquo;.
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="button" onClick={requestSend} disabled={isSending}>
          {isSending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Send announcement
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Send to {recipients} {recipients === 1 ? "person" : "people"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              An announcement cannot be edited or taken back once it is sent.
              {sendPush ? " Their phones will be alerted." : " It will appear in their notifications screen only."}
              {isUrgent && options.activeUrgent && ` It replaces the urgent banner “${options.activeUrgent.title}”.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                formRef.current?.requestSubmit();
              }}
            >
              Send
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
