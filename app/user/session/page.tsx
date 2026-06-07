"use client";

import { WalletSessionListPage } from "@/components/sessions/WalletSessionListPage";

export default function UserSessionListPage() {
  return <WalletSessionListPage basePath="/user/session" backHref="/user" backLabel="User" />;
}
