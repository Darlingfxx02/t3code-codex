# Design files

Open **Design** from the left navigation on web or desktop to work with editable
pages, layers and prototypes. In Preview, use **Open in Canvas** to capture the
current screen as a new file. Imports keep the captured appearance; application
behavior still belongs to the original code.

Design files save automatically on this device, in the browser profile running
T3 Code. You can work without a server. Open the menu beside the document name
and choose **Save a local copy** to download a `.design.json` file with its images;
use **Open Design file** on another device to
open an independent copy. Keep a downloaded copy before clearing browser data.

**Move file to trash** removes a file from the file list. Restore it through
**Recently deleted**. Deleting a local file does not delete an exported file or a
copy saved in a project.

To share changes through a project, open **Project connection** in the document
menu, connect the file to a project, and use **Sync now** in that submenu. Local
saving and project sync have separate statuses. If another window
changes the same local file, your unsaved edits stay open: save a recovery copy
before leaving. If a local write fails, retry it or download the recovery file.

Images can be placed one at a time after choosing several files. Click to keep the
original size, drag to resize, or press Escape to cancel placement. Imported
images remain in Assets for reuse. Select an image to adjust Fill, Fit, Crop or
Tile in the Inspector.

**Import > Paste as React** in the document menu accepts JSX or a default React
component. Set the viewport size before importing. Components, expressions and mount effects render once;
the resulting layers and images can then be edited without running the React code.
React and React DOM are included. If the source needs other project dependencies,
capture the running screen through **Open in Canvas** or supply their source files.

Use **Scale** (`K`) to resize a selection and its contents proportionally, including
text, strokes and spacing. Drag a selection handle or enter a multiplier or dimension;
the anchor point chooses which part stays in place. Ordinary resize keeps nested
constraints and auto layout in control of the contents.

For playback settings, deselect layers and open **Prototype**. A custom viewport
changes the playback window without resizing your design layers. **Present** runs
the prototype; Escape closes an open overlay first, then returns to the editor.
