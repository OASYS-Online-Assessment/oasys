#!/bin/bash

goodmark=$(printf "\033[1m\033[32m\xe2\x9c\x93 \xf0\x9f\x98\x8e\033[0m")
badmark=$(printf "\033[1m\033[31m\xe2\x9c\x97 \xf0\x9f\x98\xad\033[0m")

function cr8ref() {
	if [[ "$BUILDQUIET" -ne 1 ]]; then
		echo
		echo -e "Are you absolutely sure you want to overwrite the current reference file and create a new one?\nThink about it...\n"
		read -n1 -p "Enter 'y' to continue, or hit ENTER to return to menu: " cont_yn
		echo
		test "$cont_yn" != "y" && menu
	fi
	commitVal=$(git log --oneline -1 | awk '{print $1}')
	[ -f "sha1_data/oasys_sha1s.txt.ref" ] && rm sha1_data/oasys_sha1s.txt.ref # remove current ref file if it exists
	echo -ne "\033[7mProcessing.\033[0m"
	(while true; do
		echo -ne "\033[7m.\033[0m"
		sleep 0.05
	done) &
	procPID=$!
	find ../../ -type f -print0 2>/tmp/fv_err | sort -z | xargs -0 sha1sum >sha1_data/oasys_sha1s.txt.ref
	dr0="${PIPESTATUS[0]}"
	kill -9 "$procPID"
	wait "$procPID" 2>/dev/null # for suppressing the kill output message
	remExclusions "sha1_data/oasys_sha1s.txt.ref"
	if [ "$dr0" -eq 0 ] && [ -f "sha1_data/oasys_sha1s.txt.ref" ]; then
		echo
		echo "sha1_data/oasys_sha1s.txt.ref created at $(date) on commit $commitVal" >sha1_data/sha_ref_cr8.log
		echo
		echo -e "[ $goodmark ] New baseline SHA1 reference file created for commit $commitVal."
	else
		echo -e "[ \033[1m\033[31m$(printf '\xe2\x9d\x8c')\033[0m] Baseline reference find and file generation failed."
		echo -ne "\t* "
		cat /tmp/fv_err
	fi

	if [ "$nomenu" -eq 1 ]; then exit 0; fi
	echo -e "\033[32m\033[1mPress any key to return to menu, or 'q' to quit.\033[0m"
	key2quit
	menu
}

function doComp() {
	clear
	if ! [[ -e sha1_data/oasys_sha1s.txt.ref ]]; then
		echo
		echo -e "\033[1m\033[31mSHA1 reference file not found! Please import or build a reference file first!\033[0m"
		echo
		echo -e "\033[32m\033[1mPress any key to return to menu, or 'q' to quit.\033[0m"
		key2quit
		menu
	fi

	echo

	commitVal=$(git log --oneline -1 | awk '{print $1}') >sha1_data/last_result.log
	echo -ne "\033[7mProcessing.\033[0m"
	(while true; do
		echo -ne "\033[7m.\033[0m"
		sleep 0.05
	done) &
	procPID=$!
	find ../../ -type f -print0 | sort -z | xargs -0 sha1sum >sha1_data/oasys_sha1s.txt.cur
	findRES=$?

	# sort the current and ref files internally by the filename (2nd column) to ensure diff checking is not mangled
	sort -k 2 -o sha1_data/oasys_sha1s.txt.cur sha1_data/oasys_sha1s.txt.cur
	sort -k 2 -o sha1_data/oasys_sha1s.txt.ref2 sha1_data/oasys_sha1s.txt.ref

	remExclusions "sha1_data/oasys_sha1s.txt.cur"
	diff -W1200 -y sha1_data/oasys_sha1s.txt.cur sha1_data/oasys_sha1s.txt.ref2 --suppress-common-lines &>/dev/null
	diffRES=$?
	kill -9 "$procPID"
	wait "$procPID" 2>/dev/null # for suppressing the kill output message

	echo
	echo

	if [[ "$findRES" -eq 0 ]]; then echo -e "[ $goodmark ] Oasys checksum file built successfully [sha1_data/oasys_sha1s.txt.cur]." | tee -a sha1_data/last_result.log; else echo -e "[ $badmark ] Oasys checksum file build failed." | tee -a sha1_data/last_result.log; fi
	if [[ "$diffRES" -eq 0 ]] && [[ -f "sha1_data/oasys_sha1s.txt.cur" ]]; then
		echo -e "[ $goodmark ] File system integrity check passed." | tee -a sha1_data/last_result.log
		echo | tee -a sha1_data/last_result.log
	else
		echo -e "[ $badmark ] File system integrity check failed.\n" | tee -a sha1_data/last_result.log
		echo -e "This following file list may show:" | tee -a sha1_data/last_result.log
		echo -e "* Additional files not included in baseline." | tee -a sha1_data/last_result.log
		echo -e "* Files removed which are part of the baseline." | tee -a sha1_data/last_result.log
		echo -e "* Files which do not match the baseline reference checksum." | tee -a sha1_data/last_result.log
		echo -e "-----------------------------------------------------\n" | tee -a sha1_data/last_result.log
		echo -e "\033[31m\033[1mFAILED FILE(S):\033[0m" | tee -a sha1_data/last_result.log

		diffOut=$(diff -W1200 -y sha1_data/oasys_sha1s.txt.cur sha1_data/oasys_sha1s.txt.ref2 --suppress-common-lines --ignore-blank-lines)

		while IFS= read -r diffProc; do
			if [[ "$diffProc" == *"<"* ]]; then echo -e "EXTRA:\t\t $(echo "$diffProc" | awk -F'[|<>]' '{split($1,a," "); for(i=2;i<=length(a);i++) printf "%s%s", a[i], (i<length(a)?" ":""); print ""}')" | tee -a sha1_data/last_result.log; fi
			if [[ "$diffProc" == *">"* ]]; then echo -e "MISSING:\t $(echo "$diffProc" | awk -F'[|<>]' '{split($2,a," "); for(i=2;i<=length(a);i++) printf "%s%s", a[i], (i<length(a)?" ":""); print ""}')" | tee -a sha1_data/last_result.log; fi
			if [[ "$diffProc" == *"|"* ]]; then echo -e "DIFFERENT:\t $(echo "$diffProc" | awk -F'[|<>]' '{split($1,a," "); for(i=2;i<=length(a);i++) printf "%s%s", a[i], (i<length(a)?" ":""); print ""}')" | tee -a sha1_data/last_result.log; fi
		done <<<"$diffOut"
	fi

	rm sha1_data/oasys_sha1s.txt.ref2

	getEmptyDirs | tee -a sha1_data/last_result.log

	echo -e "-----------------------------------------------------\nResults valid as of: $(date)" | tee -a sha1_data/last_result.log
	echo
	echo "Results saved in: \"sha1_data/last_result.log\""
	echo
	echo
	if [ "$nomenu" -eq 1 ]; then exit 0; fi
	echo -e "\033[32m\033[1mPress any key to return to menu, or 'q' to quit.\033[0m"
	key2quit
	menu
}

function getEmptyDirs() {
	# find ../../ -type d -empty -print | grep -v git | xargs -I {} echo -e "EMPTY:\t\t \"{}\""
	find ../../ -type d -empty -print | grep -v "/\.git" | grep -v "/media/.*" | xargs -I {} echo -e "EMPTY:\t\t \"{}\""
}

function showLastLog {
	clear
	echo -e "\033[4m\033[1mLast Logfile Output:\033[0m"
	echo
	cat sha1_data/last_result.log
	echo
	echo
	if [ "$nomenu" -eq 1 ]; then exit 0; fi
	echo -e "\033[32m\033[1mPress any key to return to menu, or 'q' to quit.\033[0m"
	key2quit
}

# HELPER FUNCTIONS #

function remExclusions() {
	rfTarg=$1

# MacOS requires a different expression formulation for the sed 'in place' option since it uses BSD 'sed'
if [[ "$OSTYPE" == *"linux"* ]]; then
        sed -i -E "/\/\.git\//d" "$rfTarg"
        sed -i -E "/\/media\//d" "$rfTarg"
		sed -i -E "/\/conf\//d" "$rfTarg"
        sed -i -E "/\\.\.\/\.\.\/modules\/.+\//d" "$rfTarg"
        sed -i -E "/(\.log$|\.ref$|\.cur$|\.gitignore|\.yaml$|\.txt$|install\.db$|cl_key\.txt|db_credentials\.php|ssodata\.php|sp_metadata\.xml|.zip$)/d" "$rfTarg"
        sed -i -E "/\/\.[a-zA-Z0-9]+\//d" "$rfTarg"
    else
        sed -i '' -E "/\/\.git\//d" "$rfTarg"
        sed -i '' -E "/\/media\//d" "$rfTarg"
		sed -i '' -E "/\/conf\//d" "$rfTarg"
        sed -i '' -E "/\\.\.\/\.\.\/modules\/.+\//d" "$rfTarg"
        sed -i '' -E "/(\.log$|\.ref$|\.cur$|\.gitignore|\.yaml$|\.txt$|install\.db$|cl_key\.txt|db_credentials\.php|ssodata\.php|sp_metadata\.xml|.zip$)/d" "$rfTarg"
        sed -i '' -E "/\/\.[a-zA-Z0-9]+\//d" "$rfTarg"
    fi
}

function key2quit {
	read -n1 -s keyret
	if [ "$keyret" == "Q" ] || [ "$keyret" == "q" ]; then
		echo
		echo
		exit 0
	fi
}

function exitTrap {
	rm /tmp/fv_err &>/dev/null
	tput cnorm
}

function displayHelp {
	echo -e "\n\nOasys System File Verifier Command Line Options:"
	echo "------------------------------------------------"
	echo -e "\t--validate, -v\t\t\tValidate the current Oasys file system against the existing reference SHA1 checksum file."
	echo -e "\t--build-ref, -b\t\t\tBuild a new SHA1 reference file based on the current Oasys file system."
	echo -e "\t--build-ref-silent, -brs\tBuild a new SHA1 reference file based on the current Oasys file system quietly!"
	echo -e "\t--showlog, -s\t\t\tShow the logfile output from the last validation check."
	echo -e "\t--non-interactive, -n\t\tRun script in non-interactive mode. The script will execute the requested command and immediately exit without requesting user input."
	echo -e "\t--help, -h\t\t\tThis screen."
	exit 0
}

# MENU SYSTEM #
function menu() {
	clear
	echo
	echo "[1] Create new SHA1 baseline reference for this commit."
	echo "[2] Test current Oasys file system against baseline reference."
	echo "[3] Show logfile output of last validation run."
	echo "[4/q] Quit."
	echo
	read -n1 -p "Choose an option: " optval

	if [[ $optval -eq 1 ]]; then cr8ref; fi
	if [[ $optval -eq 2 ]]; then doComp; fi
	if [[ $optval -eq 3 ]]; then showLastLog; fi
	if [[ $optval -eq 4 ]]; then
		clear
		exit 0
	fi
	if [[ $optval == "q" ]]; then
		clear
		exit 0
	fi
	if [[ $optval == "Q" ]]; then
		clear
		exit 0
	fi
	menu
}

trap exitTrap EXIT
tput civis

cd "$(dirname "$0")" || exit

if [[ "$*" == *"-n"* ]] || [[ "$*" == *"--non-interactive"* ]]; then nomenu=1; else nomenu=0; fi

for cliarg in "${@}"; do
	if [ "$cliarg" == "--validate" ] || [ "$cliarg" == "-v" ]; then doComp; fi
	if [ "$cliarg" == "--build-ref" ] || [ "$cliarg" == "-b" ]; then cr8ref; fi
	if [ "$cliarg" == "--find-empty-dirs" ] || [ "$cliarg" == "-fed" ]; then getEmptyDirs; fi
	if [ "$cliarg" == "--build-ref-silent" ] || [ "$cliarg" == "-brs" ]; then
		BUILDQUIET=1
		cr8ref
	fi
	if [ "$cliarg" == "--help" ] || [ "$cliarg" == "-h" ]; then displayHelp; fi
	if [ "$cliarg" == "--showlog" ] || [ "$cliarg" == "-s" ]; then showLastLog; fi
done

menu
