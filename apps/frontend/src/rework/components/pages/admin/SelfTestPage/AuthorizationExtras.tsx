// Copyright Thales 2026
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "@shared/atoms/Button/Button.tsx";
import TextInput from "@shared/atoms/TextInput/TextInput.tsx";
import Select from "@shared/molecules/Select/Select.tsx";
import type { OptionModel } from "@models/Option.model.ts";
import { ConfirmationDialog } from "@shared/molecules/ConfirmationDialog/ConfirmationDialog";
import { usePipelineRun } from "../../../../features/pipeline/usePipelineRun";
import {
  credentialExpiryScenario,
  expiryWaitSeconds,
} from "../../../../features/pipeline/scenarios/credentialExpiryScenario";
import { MAX_HOLD_MINUTES } from "../../../../features/pipeline/types";
import { useAuthzProbeRun } from "../../../../features/pipeline/useAuthzProbeRun";
import { useListUsersQuery } from "../../../../../slices/controlPlane/controlPlaneApiEnhancements";
import { KeyCloakService } from "../../../../../security/KeycloakService";
import { StepReportPanel } from "./StepReportPanel";
import styles from "./SelfTestPage.module.css";

interface AuthorizationExtrasProps {
  busy: boolean;
  onRunningChange: (running: boolean) => void;
}

/** The two authorization checks that stay out of Run all: another account's probe, and session expiry. */
export function AuthorizationExtras({ busy, onRunningChange }: AuthorizationExtrasProps) {
  const { t } = useTranslation();
  const profileRun = useAuthzProbeRun();
  const { data: users } = useListUsersQuery();
  const [username, setUsername] = useState<string | undefined>(undefined);
  const [password, setPassword] = useState("");
  const realmConfig = useMemo(() => KeyCloakService.GetKeycloakRealmConfig(), []);
  const expiryScenario = useMemo(() => credentialExpiryScenario(), []);
  const expiryRun = usePipelineRun(expiryScenario);
  // The wait is quoted from the session as it was when the notice opened, so
  // the figure the admin accepts is the one the run then uses.
  const [pendingExpiry, setPendingExpiry] = useState<{ waitSeconds: number | null } | null>(null);

  useEffect(
    () => onRunningChange(profileRun.isRunning || expiryRun.isRunning),
    [profileRun.isRunning, expiryRun.isRunning, onRunningChange],
  );

  const userOptions: OptionModel<string>[] = useMemo(
    () =>
      (users ?? [])
        .filter((u) => u.username)
        .map((u) => ({ key: u.id, value: u.username as string, label: u.username as string })),
    [users],
  );

  const handleRunForProfile = () => {
    if (!username || !password) return;
    void profileRun.runForProfile(username, password);
    setPassword("");
  };

  return (
    <>
      {realmConfig && (
        <div className={styles.testProfilePanel}>
          <h3 className={styles.testProfileTitle}>{t("rework.selftest.authz.testProfile.title")}</h3>
          <div className={styles.testProfileFields}>
            <Select
              size="medium"
              options={userOptions}
              value={username}
              onChange={setUsername}
              label={t("rework.selftest.authz.testProfile.usernameLabel")}
              placeholder={t("rework.selftest.authz.testProfile.usernamePlaceholder")}
            />
            <TextInput
              type="password"
              label={t("rework.selftest.authz.testProfile.passwordLabel")}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <Button
              color="secondary"
              variant="outlined"
              size="medium"
              onClick={handleRunForProfile}
              disabled={busy || !username || !password}
            >
              {t("rework.selftest.authz.testProfile.run")}
            </Button>
          </div>
          <p className={styles.testProfileCaption}>{t("rework.selftest.authz.testProfile.caption")}</p>
          <StepReportPanel
            steps={profileRun.steps}
            isRunning={profileRun.isRunning}
            emptyLabel={t("rework.selftest.report.empty")}
          />
        </div>
      )}

      {KeyCloakService.GetToken() && (
        <div className={styles.testProfilePanel}>
          <div className={styles.header}>
            <h3 className={styles.testProfileTitle}>{t("rework.selftest.authz.expiry.title")}</h3>
            <Button
              color="secondary"
              variant="outlined"
              size="medium"
              icon={{ category: "outlined", type: "schedule", filled: false }}
              onClick={() =>
                setPendingExpiry({ waitSeconds: expiryWaitSeconds(KeyCloakService.GetTokenSecondsLeft()) })
              }
              disabled={busy}
            >
              {t("rework.selftest.authz.expiry.run")}
            </Button>
          </div>
          <p className={styles.testProfileCaption}>
            {t("rework.selftest.authz.expiry.caption", { maxMinutes: MAX_HOLD_MINUTES })}
          </p>
          <ConfirmationDialog
            open={pendingExpiry !== null}
            title={t("rework.selftest.authz.expiry.warning.title")}
            message={
              pendingExpiry?.waitSeconds
                ? t("rework.selftest.authz.expiry.warning.message", {
                    minutes: Math.max(1, Math.round(pendingExpiry.waitSeconds / 60)),
                  })
                : t("rework.selftest.authz.expiry.warning.messageUnknownWait")
            }
            confirmLabel={t("rework.selftest.authz.expiry.warning.confirm")}
            cancelLabel={t("common.cancel")}
            onConfirm={() => {
              setPendingExpiry(null);
              void expiryRun.start();
            }}
            onCancel={() => setPendingExpiry(null)}
          />
          <StepReportPanel
            steps={expiryRun.steps}
            isRunning={expiryRun.isRunning}
            emptyLabel={t("rework.selftest.report.empty")}
          />
        </div>
      )}
    </>
  );
}
