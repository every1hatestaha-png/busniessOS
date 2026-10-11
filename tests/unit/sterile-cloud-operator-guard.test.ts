import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
const require = createRequire(import.meta.url);
const { assertCloudInvocation } = require("../../scripts/run-sterile-cloud-migrations.cjs");
const sha = "a".repeat(40);
const e = {
  GITHUB_ACTIONS:"true", CI:"true", GITHUB_EVENT_NAME:"pull_request",
  GITHUB_RUN_ATTEMPT:"1", GITHUB_REPOSITORY:"every1hatestaha-png/busniessOS",
  GITHUB_HEAD_SHA:sha, STERILE_CANDIDATE_SHA:sha,
  STERILE_NEON_ENVIRONMENT:"sterile-neon-rc132",
};
const event = {
  action:"labeled",label:{name:`db-${sha}`},sender:{login:"every1hatestaha-png"},
  pull_request:{
    state:"open",draft:true,
    head:{sha,ref:"ops/sterile-neon-cloud-manual-20261010",repo:{full_name:"every1hatestaha-png/busniessOS"}},
    base:{ref:"fix/sterile-runner-diagnostics-20261010",repo:{full_name:"every1hatestaha-png/busniessOS"}},
  },
};
describe("manual-only GitHub sterile Neon operator safety",()=>{
  it("accepts only explicit owner-labeled same-repo exact head on first attempt",()=>{
    expect(assertCloudInvocation(event,e)).toBe(sha);
  });
  it.each([
    [{...event,action:"opened"},e],
    [{...event,action:"synchronize"},e],
    [{...event,label:{name:"db-unknown"}},e],
    [{...event,sender:{login:"attacker"}},e],
    [{...event,pull_request:{...event.pull_request,draft:false}},e],
    [{...event,pull_request:{...event.pull_request,head:{...event.pull_request.head,repo:{full_name:"fork/repo"}}}},e],
    [{...event,pull_request:{...event.pull_request,base:{...event.pull_request.base,ref:"main"}}},e],
    [{...event,pull_request:{...event.pull_request,head:{...event.pull_request.head,ref:"other"}}},e],
    [event,{...e,GITHUB_RUN_ATTEMPT:"2"}],
    [event,{...e,GITHUB_EVENT_NAME:"push"}],
    [event,{...e,CI:undefined}],
    [event,{...e,GITHUB_HEAD_SHA:"b".repeat(40)}],
    [event,{...e,STERILE_CANDIDATE_SHA:"b".repeat(40)}],
    [event,{...e,STERILE_NEON_ENVIRONMENT:"production"}],
    [event,{...e,VERCEL:"1"}],
  ])("rejects every unapproved event/context without touching provider: %#",(ev,env)=>{
    expect(()=>assertCloudInvocation(ev,env)).toThrow();
  });
});
