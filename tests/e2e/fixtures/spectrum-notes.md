# Spectrum

## Aliasing

![Spectrum of a sampled signal with overlapping copies](figures/spectrum.png)

When a signal is sampled below twice its highest frequency, the copies of its spectrum overlap and the high frequencies fold back as false low frequencies.
This folding effect is called aliasing and it cannot be undone after sampling.
An anti-aliasing low-pass filter removes the frequencies above half the sampling rate before the signal is sampled.
