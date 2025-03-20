
Configuration
=============

**Inputs**



Name | Description | Example
--- | --- | ---
repository | The repository name in full | imtf-group/public-actions

**Additional Inputs (Optional)**

Name | Description | Example
--- | --- | ---
excludes | Exclude draft or pre-release versions. | "prerelease, draft"
token | GitHub token or personal access token | `${{ secrets.SERVICE_ACCOUNT_PAT }}` or `${{ secrets.GITHUB_TOKEN }}` or `${{ secrets.PERSONAL_ACCESS_TOKEN }}`

**Outputs**

Name | Description | Example
--- | --- | ---
release | The latest release version tag | v0.3.0
id | The latest release version id | 12345
description | The latest release description body | This is an example release

Usage Example
=============

Please use token even if it is not required to avoid throttling issues on github API.

``` yaml
name: Build Docker Images
on: [push, repository_dispatch]

jobs:
  build:
    name: Test actions
    runs-on: ubuntu-latest
    steps:
      - id: keycloak-imtf-siron-one
        uses: imtf-group/public-actions/gh-get-latest-release@main
        with:
          repository: imtf-group/keycloak-theme-siron-one
          excludes: prerelease, draft
          token: ${{ secrets.SERVICE_ACCOUNT_PAT }}
      - id: keycloak
        uses: imtf-group/public-actions/gh-get-latest-release@main
        with:
          repository: keycloak/keycloak
          token: ${{ secrets.SERVICE_ACCOUNT_PAT }}
      - id : debug
        run: echo ${{ steps.keycloak-imtf-siron-one.outputs.release }}
      - id : debug
        run: echo ${{ steps.keycloak.outputs.release }}

```

To use the current repo:
``` yaml
with:
  repository: ${{ github.repository }}
```
