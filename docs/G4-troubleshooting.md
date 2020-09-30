---
title: Troubleshoot
parent: Generation 4
nav_order: 99
has_children: true
---


## Arena does not turn on

If the arena does not turn on, check that the connection between the interconnect board and the VHDCI cable is good. The VHDCI cables can sometimes need a very tight fit to make all the connections.

Using a voltmeter, check that the arena board is being supplied with 5 V as expected.

Some issues in the past have been caused by mistakes in the arena board assembly. The connectors between the arena board and the LED panels have sometimes been placed on the wrong side of the arena board or have had the gendered 15-pin connectors switched between the top and bottom arena boards. To see if this is the case, remove all of the LED panels from the arena board and plug one column back in, but inserted backwards (where the LEDs are facing to the outside of the arena). If an “all on” command turns on the LEDs in this case, then the connectors were placed incorrectly.

## `Error: Create Folder…`

If the `G4 Host.exe` reports *Error: Create Folder in FileIO […] HHMI – Generate File paths.vi…*{:.gui-txt}, make sure that the following directories exist within `C:\Program Files (x86)\HHMI G4\Support Files`: 

- `Analog Output Functions`,
- `Functions`,
- `Log Files`, and
- `Patterns`.

Create empty directories if they don’t exist.

## Computer freezes at startup
 
If your system freezes when clicking on *Start Log*{:.gui-btn} try to move the PCI card to a different PCI slot. On two recent machines (Dell Precision 5820) 2 out of 5 slots worked.

## Status window error

If *Start Log*{:.gui-btn} leads to an error in the status window, then your application has insufficient access rights. In the Windows explorer, give *Full Access*{:.gui-txt} rights to `C:\Program Files (x86)\HHMI G4\Support Files\Log Files` for the *USER*{:.gui-txt} accounts.

## *Deque timeout* is activated in PControl

After running `PControl_G4`, check the LabVIEW window to see if the green light labelled *dequeue timeout*{:.gui-txt} is lit. If it is, it may be that the transfer speeds between the PCIe card and the computer’s memory is too slow. If the computer is relatively new/fast, one possible cause of this problem has been noted with newer Dell workstations, which can be fixed by updating the BIOS. 

Regardless of the computer make/model, it may be worth updating the computer's BIOS and seeing if that helps, which can be done by finding your PC’s manufacture support webpage and downloading the latest BIOS installer (e.g. for Dells: <https://www.dell.com/support/home/us/en/04>).

## Flickering LEDs

If you see some or all the LEDs flicker similar to the image on the right, this could be caused by noise from a long ribbon cable. 

![Flickering LEDs](../assets/G4/arena_flicker_cable.gif){:.ifr}