export interface EventPayload {
  message: string;
  chatId?: string;
}

export interface NotificationEvent {
  eventId: string;
  type: string;
  payload: EventPayload;
  createdAt: string;
}
