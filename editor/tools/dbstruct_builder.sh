#!/bin/bash
set -o pipefail # this allows us to catch the maria-dump exit code!
clear;

read -p "DB username to perform export (use 'root' if you know its password): " dbuser
if [[ -z $dbuser ]]; then echo ; echo -e "\033[1;31mUsername value is required!\033[0m\nExiting script..."; echo ; exit 1; fi;


echo -n "DB password for given username: "
while IFS= read -r -s -n1 pass; do
  if [[ -z $pass ]]; then
     echo
     break
  else
     echo -n '*'
     dbpass+=$pass
  fi
done

if [[ -z $dbpass ]]; then echo ; echo -e "\033[1;31mPassword value is required!\033[0m\nExiting script..."; echo ; exit 1; fi;

read -p "DB name to export: " dbname
if [[ -z $dbname ]]; then echo ; echo -e "\033[1;31mDatabase name value is required!\033[0m\nExiting script..."; echo ; exit 1; fi;

read -p "DB host from which to export (leave blank for 'localhost'): " dbhost
if [[ -z $dbhost ]]; then dbhost="localhost"; fi;

read -p "Name to give export file (leave blank for 'structure.sql'): " expname
if [[ -z $expname ]]; then expname="structure.sql"; fi;

if [[ -f "./structure.sql" ]]; then mv structure.sql structure.bkp; echo -e "\033[1;36m!! structure.sql was found, and renamed to structure.bkp. Remove this backup file if it is not needed. !!\033[0m"; fi;

echo -e "\033[1;31m"
mariadb-dump -u$dbuser -p$dbpass -h $dbhost --opt $dbname -d --single-transaction --default-character-set=utf8mb4 | sed 's/ AUTO_INCREMENT=[0-9]*//g' | sed -r  s'#/\*![0-9]{5} ?([^*]*)\*/#\1#'g | sed 's/DEFINER=.*`/DEFINER=CURRENT_USER/g' > $expname
if [[ $? == 0 ]]; then echo -e "\033[1;32mDone without (reported) errors!\033[0m";else echo -e "\033[0m"; rm structure.sql; fi;

echo 
exit 0
