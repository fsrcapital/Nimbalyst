export interface WorkflowSource<Reason extends string = string> {
  id: string;
  myNotes: string;
  nextAction: string;
  waitingOn: string;
  attentionReasons: readonly Reason[];
}

export interface WorkflowDraft<Reason extends string = string> {
  sessionId: string;
  myNotes: string;
  nextAction: string;
  waitingOn: string;
  attentionReasons: Reason[];
}

export function startWorkflowDraft<Reason extends string>(
  session: WorkflowSource<Reason>,
): WorkflowDraft<Reason> {
  return {
    sessionId: session.id,
    myNotes: session.myNotes,
    nextAction: session.nextAction,
    waitingOn: session.waitingOn,
    attentionReasons: [...session.attentionReasons],
  };
}

export function patchWorkflowDraft<Reason extends string>(
  draft: WorkflowDraft<Reason>,
  patch: Partial<Omit<WorkflowDraft<Reason>, "sessionId">>,
): WorkflowDraft<Reason> {
  return {
    ...draft,
    ...patch,
    attentionReasons: patch.attentionReasons
      ? [...patch.attentionReasons]
      : draft.attentionReasons,
  };
}

export function draftForSession<Reason extends string>(
  session: WorkflowSource<Reason>,
  draft: WorkflowDraft<Reason> | null,
): WorkflowDraft<Reason> {
  return draft?.sessionId === session.id ? draft : startWorkflowDraft(session);
}
