#!/bin/bash

set -euo pipefail

WORKFLOWS_PATH=${1:-.github/workflows}
CI=${CI:-false}

PROJECT_ROOT=$(cd $(dirname $0)/.. && pwd)

pushd $PROJECT_ROOT
  find . -name action.yml | cut -d / -f 2 | while read -r action; do
    echo "Chart found: $action"
    if [ ! -f "$WORKFLOWS_PATH/$action.yaml" ]; then
      echo "Create workflow for $action"
      sed "s/ACTION_NAME/$action/g" ci/template.yaml > "$WORKFLOWS_PATH/$action.yaml"
    fi
  done

  if $CI; then
      git config user.name github-actions
      git config user.email github-actions@github.com
      git add $WORKFLOWS_PATH
      git commit -m "New action detected"
      git push
  fi
popd
