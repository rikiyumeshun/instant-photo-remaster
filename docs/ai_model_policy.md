# AI Model Policy

Instant Photo Remaster currently uses Canvas-based local processing and a Pillow-based server PoC. It does not include Real-ESRGAN, GFPGAN, InstantIR, SwinIR, or other heavy model weights.

Before adding a real AI restoration or super-resolution model:

- Check the code license.
- Check the model weight license separately.
- Check licenses of all runtime dependencies.
- Check whether training data or model card terms add commercial-use restrictions.
- Do not use non-commercial-only models in commercial features.
- For face restoration models, show UI warnings that the person's face may change.
- Do not imply identity-preserving restoration unless the model and evaluation support that claim.
- Prepare a license table before commercial release.
- Update Privacy text and in-app consent if processing, storage, or third-party services change.

Candidate models such as Real-ESRGAN, GFPGAN, InstantIR, and SwinIR must pass this review before being exposed in paid functionality.
