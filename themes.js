function setImageStyle(img, style) {
  const src = img.dataset.src;

  const lastSlash = src.lastIndexOf("/");
  const dirname = src.substring(0, lastSlash + 1);
  const filename = src.substring(lastSlash + 1);

  const colorScheme = style ?? getComputedStyle(img).colorScheme;

  img.src = dirname + colorScheme + "_" + filename;
}

function updateStyledImages(style) {
  for (const img of document.getElementsByTagName("img")) {
    if (img.dataset.src !== undefined) {
      setImageStyle(img, style);
    }
  }
}

function themeStyle(name) {
  if (name === "light" || name === "rust") {
    return "light";
  } else /* name === "coal" || name === "navy" || name === "ayu" */ {
    return "dark";
  }
}

updateStyledImages();

for (const button of document.querySelectorAll("button.theme")) {
  button.onclick = () => {
    updateStyledImages(themeStyle(button.id));
  };
}
