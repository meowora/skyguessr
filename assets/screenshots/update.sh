rm ../../src/extra.js
echo "// DO NOT EDIT, THIS FILE IS GENERATED" > ../../src/extra.js
echo >> ../../src/extra.js
echo "export const EXTRA_LOCATIONS = [" >> ../../src/extra.js
find . -not -name "." -and -type d -exec bash -c '[ -e $1/coords ] && echo "  "{ folder: \"$(echo $1 | cut -c 3-)\", coords: \"$(cat $1/coords)\", hint: \"meow\" }, >> ../../src/extra.js' _ '{}' \;
echo "];" >> ../../src/extra.js
