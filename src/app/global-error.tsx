"use client";

import "./globals.css";

import { messagesFor } from "@/i18n/messages";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const messages = messagesFor("id");
  return (
    <html lang="id">
      <body className="min-h-dvh">
        <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-5">
          <h1 className="text-2xl font-bold">{messages.errors.errorTitle}</h1>
          <p>{messages.errors.errorBody}</p>
          <button type="button" onClick={reset}>
            {messages.common.retry}
          </button>
        </main>
      </body>
    </html>
  );
}
