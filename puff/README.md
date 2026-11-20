# Puff Web

Double-click **Puff.html** to run the original DOS Puff 2.1 in your browser. The HTML contains Puff and the DOSBox WebAssembly emulator. It runs offline, and circuit analysis happens in your browser.

## Display

Puff's original panels share one large display with high-DPI smoothing. The desktop layout sizes itself to the available browser space, including a normal Firefox window on a 1920×1080 screen.

## Open and save circuits

- The **Examples** menu starts with `amp.puf`, `bpf.puf`, `chebylc.puf`, and the default `setup.puf`.
- Put your own `.puf` files and any companion `.dev` models into the **examples** folder. Click **Choose folder…**, select **examples**, then choose a circuit from the menu. When the browser grants live access, the menu picks up new files automatically while the page is open. Use **Refresh** to check immediately. In Firefox and other browsers using the standard folder picker, click **Refresh** and reselect the same folder after adding files.
- Use **Open .PUF** to open a single circuit from anywhere. Select its companion `.dev` files at the same time, or load them from a folder first.
- **Save .PUF** downloads a native Puff circuit file. Save before restarting or closing the page. To add the download to the Examples menu, move it into **examples** and select the folder again.
- Puff assigns a short DOS filename to imported names longer than eight characters or containing spaces. The web status line displays the original filename.

## Keyboard

Click inside the VGA display to type. Use the sidebar if your browser or keyboard reserves a shortcut. **Shift+Esc** returns focus to the web controls.

| Key | Puff command |
| --- | --- |
| F1, F2, F3, F4 | Layout, Plot, Parts, Board |
| F5, F10 | Change colors, show help for the active window |
| Arrows | Move through the circuit or edit fields |
| Shift+arrow | Erase in Layout. Click **Shift**, then an arrow to do this on screen. |
| Page Up, Page Down | Move the marker through the Plot sweep |
| P, Ctrl+P, H | Analyze, replot, or halt a running analysis |
| I, S | Impulse and step response in Plot. Enter an fd/df value when prompted, or press Enter for 10. |
| A–R, 1–4 | Select a part or connect a port in Layout |
| =, +, Ctrl+N | Ground, unground, or snap to a node in Layout |
| Alt+O, Alt+D, Alt+M, Alt+P | Enter Ω, °, µ, or ∥ in Parts |
| Alt+S | Open the large Smith chart in Plot |
| Tab | Toggle the view or board type in the current window |

The **Puff manual** is available from the header when the PDF is beside the HTML. Printer and plotter commands depend on the emulated DOS hardware. A step-by-step **Windows 7 Puff 2.1 tutorial** (2013, English) is also linked for download from the header and the credits section; it is a third-party document, not part of the Puff distribution.

## Sources

- Puff 2.1 is by Scott W. Wedge, Richard C. Compton, David B. Rutledge, and Andreas Gerstlauer. Puff Web embeds the checksum-verified [original DOS release](https://www.gerstlauer.de/puff/).
- The manual and circuit examples come from the supplied Linux Puff distribution. [Puff on Linux](https://www.pa3fwm.nl/software/puff/)
- The emulator assets are from the `emulators` npm release 8.5.3. The bundled emulator components are distributed under GPLv2; see the [js-dos emulator source](https://github.com/js-dos/emulators/tree/e6f4e5449a5b17ae3ea0fdccfd453c8d299e9ea5) and [DOSBox-X source](https://github.com/js-dos/dosbox-x/tree/788fde99d3d451eab3621009186e5abe516f2b9c).
- Puff's GPLv3 license text is in [`COPYING`](COPYING). Puff is free software and comes with no warranty; the full source is available from the [PA3FWM GPL release](https://www.pa3fwm.nl/software/puff/).


