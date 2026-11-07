function nextNonWhitespace(source, index) {
  while (index < source.length && /\s/.test(source[index])) index += 1;
  return source[index];
}

function valuePath(parent) {
  if (!parent) return "";
  if (parent.type === "array") return parent.path + "[" + parent.index + "]";
  if (parent.currentKey === null) return parent.path;
  return parent.path ? parent.path + "." + parent.currentKey : parent.currentKey;
}

function createContainer(char, parent) {
  const path = valuePath(parent);
  if (char === "{") {
    return { type: "object", path, keys: new Set(), expectingKey: true, currentKey: null };
  }
  return { type: "array", path, index: 0 };
}

function recordObjectKey(object, key, duplicates) {
  const duplicatePath = object.path ? object.path + "." + key : key;
  if (object.keys.has(key)) duplicates.push(duplicatePath);
  object.keys.add(key);
  object.currentKey = key;
  object.expectingKey = false;
}

function advanceContainer(container) {
  if (!container) return;
  if (container.type === "object") {
    container.expectingKey = true;
    container.currentKey = null;
    return;
  }
  container.index += 1;
}

export function duplicateJsonKeys(source) {
  JSON.parse(source);
  const duplicates = [];
  const containers = [];
  let stringStart = -1;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (stringStart >= 0) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        const parent = containers.at(-1);
        if (
          parent?.type === "object" &&
          parent.expectingKey &&
          nextNonWhitespace(source, index + 1) === ":"
        ) {
          const key = JSON.parse(source.slice(stringStart, index + 1));
          recordObjectKey(parent, key, duplicates);
        }
        stringStart = -1;
      }
      continue;
    }

    if (char === '"') {
      stringStart = index;
      continue;
    }
    if (char === "{" || char === "[") {
      containers.push(createContainer(char, containers.at(-1)));
      continue;
    }
    if (char === "}" || char === "]") {
      containers.pop();
      continue;
    }
    if (char === ",") advanceContainer(containers.at(-1));
  }

  return duplicates;
}
