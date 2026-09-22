#!/usr/bin/env bash
set -euo pipefail

service_dir="${1:?Usage: scripts/check-service-contract.sh <pinned-service-checkout>}"
contract_dir="$(mktemp -d)"
trap 'rm -rf "$contract_dir"' EXIT

node --import tsx scripts/service-contract.ts write "$contract_dir/request.json"
expected_tag="$(node --import tsx scripts/service-contract.ts github-output)"
expected_tag="${expected_tag#tag=}"
actual_commit="$(git -C "$service_dir" rev-parse HEAD)"
tag_commit="$(git -C "$service_dir" rev-parse "refs/tags/$expected_tag^{commit}")"
if [[ "$actual_commit" != "$tag_commit" ]]; then
  echo "Service checkout must be at $expected_tag" >&2
  exit 1
fi

cp scripts/service-contract/route/desktop_contract_test.go "$service_dir/route/"
cp scripts/service-contract/dnsapi/desktop_contract_test.go "$service_dir/route/dnsapi/"
cp scripts/service-contract/sysproxyapi/desktop_contract_test.go "$service_dir/route/sysproxyapi/"
cp scripts/service-contract/processrouter/desktop_contract_test.go "$service_dir/processrouter/"
DESKTOP_SERVICE_CONTRACT="$contract_dir/request.json" \
DESKTOP_SERVICE_CONTRACT_RESPONSES="$contract_dir" \
  go -C "$service_dir" test ./route ./route/dnsapi ./route/sysproxyapi ./processrouter \
    -run '^TestDesktopContract' -count=1
node --import tsx scripts/service-contract.ts verify "$contract_dir"
