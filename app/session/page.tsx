"use client";

import { WalletSessionListPage } from "@/components/sessions/WalletSessionListPage";

export default function SessionListPage() {
  return <WalletSessionListPage basePath="/session" backHref="/user" backLabel="User" />;
}
