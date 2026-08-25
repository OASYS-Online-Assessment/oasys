#!/bin/bash

# find which actions are missing from the perm_items.json authentication file

grep -RIioPh "startajax\(('|\")(\K\w+)" ../ | sort -u | comm -23 - <(jq -r '.[] | .[]' ../inc/js/perm_items.json | sort -u)
