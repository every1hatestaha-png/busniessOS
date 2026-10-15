import {spawnSync} from "node:child_process";
import {describe,expect,it} from "vitest";

describe("V2 migration rehearsal cannot target hosted or existing business databases",()=>{
  it.each([
    "postgresql://synthetic:synthetic@hosted.invalid/munshios_gatepass_upgrade_test",
    "postgresql://synthetic:synthetic@localhost.evil.invalid/munshios_gatepass_upgrade_test",
    "postgresql://synthetic:synthetic@127.0.0.1/neondb",
    "postgresql://synthetic:synthetic@localhost/munshios_gatepass_ci",
    "https://127.0.0.1/munshios_gatepass_upgrade_test",
  ])("rejects an unauthorized target before connecting: %s",url=>{
    const result=spawnSync(process.execPath,["scripts/rehearse-gate-pass-v2-upgrade.cjs"],{env:{...process.env,DATABASE_URL:url},encoding:"utf8",timeout:5000,windowsHide:true});
    expect(result.status).toBe(1);
    const failure=JSON.parse(result.stderr.trim());
    expect(failure.stage).toBe("target-validation");
    expect(result.stderr).not.toContain(url);
    expect(result.stdout).toBe("");
  });
});
