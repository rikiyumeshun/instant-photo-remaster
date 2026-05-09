from pathlib import Path

from PIL import Image, ImageDraw


def draw_icon(size: int) -> None:
    image = Image.new("RGBA", (size, size), "#eef5fb")
    draw = ImageDraw.Draw(image)
    s = size
    draw.rounded_rectangle(
        (s * 0.26, s * 0.14, s * 0.74, s * 0.86),
        radius=int(s * 0.035),
        fill="white",
        outline="#18181b",
        width=max(3, int(s * 0.035)),
    )
    draw.rounded_rectangle((s * 0.31, s * 0.20, s * 0.69, s * 0.68), radius=int(s * 0.018), fill="#d7edf7")
    draw.ellipse((s * 0.41, s * 0.34, s * 0.55, s * 0.48), fill="#ffe7ee")
    draw.polygon(
        [
            (s * 0.31, s * 0.59),
            (s * 0.43, s * 0.45),
            (s * 0.53, s * 0.55),
            (s * 0.60, s * 0.48),
            (s * 0.69, s * 0.59),
            (s * 0.69, s * 0.68),
            (s * 0.31, s * 0.68),
        ],
        fill="#7ab7d8",
    )
    draw.rounded_rectangle((s * 0.37, s * 0.74, s * 0.63, s * 0.78), radius=int(s * 0.02), fill="#c8c8c8")
    image.save(f"public/icons/icon-{size}.png")


Path("public/icons").mkdir(parents=True, exist_ok=True)
for icon_size in (192, 512):
    draw_icon(icon_size)
