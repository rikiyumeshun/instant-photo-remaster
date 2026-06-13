class ProcessorError(Exception):
    """Base class for processor failures surfaced to the API layer."""


class ProcessorNotReadyError(ProcessorError):
    pass


class ImageTooLargeError(ProcessorError):
    pass


class ProcessingTimeoutError(ProcessorError):
    pass


class UnsupportedImageError(ProcessorError):
    pass
