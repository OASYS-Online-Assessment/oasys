# Oasys Module Directory

This directory contains installed modules which are not part of the core Oasys system. Inside the /modules location relative to the Oasys base path, each directory is a separate client module. There are currently 3 supported subdirectories inside each client module directory: 'landingpage', 'skins' and 'editor'.

## Landing Page Modules
All files necessary for a customer specific landing page are stored in the `<root>/modules/<customer dir>/landingpage/` directory. The landing page follows the general structure of landing pages that can use a `loaderManifest.json` file or that can be built in hardcoded PHP.

## Skins
In the skins folder of a customer directory, there are subdirectories for each custom skin that the client has. Each skin directory contains the files necessary for that skin to be used in the Oasys system. The skin directory must contain a `properties.json` file that defines the skin and its properties, as well as a `skin.html`, `skin.js` and `skin.css` file. Further files and directories are optional.

## Editor Modules
If there is a `modules/<customer dir>/editor` folder, there must also be an `editor.json` file inside this folder for the module to be added.
For example, the contents of the "ACME" module will be contained in a directory with the path `/modules/ACME/editor/`, and its related JSON definition file will be `/modules/ACME/editor/editor.json`.

### editor.json structure
| Property                                  | Value                                                                                                                                      |
|-------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------|
| modName                                   | The name of the module -- this value must be linked to the folder name containing module elements (case sensitive)                         |
| editor_sections                           | Parent property which will contain each individual module entry in the Oasys menu.                                                         |
| editor_sections / propertyN...            | This property entry is just a place holder for the editor entry. It is not linked to anything in the code.                                 |
| editor_sections / propertyN / name        | This property's value defines the display string for the editor.                                                                           |
| editor_sections / propertyN / pageBase    | This property's value defines the internal menu name used in the code, and **must** match the Php page's name, including case-sensitivity. |
| editor_sections / propertyN / rootURL     | This property's value defines the root file path to the target Php file for the editor, relative to the Oasys root path.                   |
| editor_sections / propertyN / accesslevel | [integer] This property's value defines the access level value for the editor (not fully implemented in Oasys yet)                         |
| editor_sections / propertyN / icon        | This property's value defines the icon id value found in `symbols.svg`.                                                                    |

### Full sample of a module definition:

```json
{
    "modName": "ACME",
    "editor_sections": {
        "acmeadmin": {
            "name": "ACME Admin",
            "pageBase": "acmeAdmin",
            "rootURL": "modules/ACME/acmeAdmin.php",
            "accesslevel": 0,
            "icon": "ic_mm_acme"
        },
        "acmeteacher": {
            "name": "ACME Teacher",
            "pageBase": "acmeTeacher",
            "rootURL": "modules/ACME/acmeTeacher.php",
            "accesslevel": 0,
            "icon": "ic_mm_acme"
        },
        "acmesup": {
            "name": "ACME Supervisor",
            "pageBase": "acmeSup",
            "rootURL": "modules/ACME/acmeSup.php",
            "accesslevel": 0,
            "icon": "ic_mm_acme"
        }
    }
}
```