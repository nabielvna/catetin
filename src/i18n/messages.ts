import en from "@/i18n/messages/en.json";
import id from "@/i18n/messages/id.json";

export type Messages = typeof id;

export function messagesFor(locale: string): Messages {
  return (locale === "en" ? en : id) as Messages;
}
