// Weavy recipe builders — port from legacy aamotion.html.
// Each function returns { nodes, edges, modelId } ready to be saved+executed.

type MkId = () => string;

const mkId: MkId = () => Math.random().toString(36).substring(2, 8);

export type MotionControlOpts = {
  imageUrl: string;
  videoUrl: string;
  orientation: "image" | "video";
  keepSound: boolean;
  modelKey: string; // e.g. fal-ai/kling-video/v3/pro/motion-control
  prompt?: string;
};

/**
 * Build Kling Motion Control recipe. Legacy uses a single fal endpoint URL and
 * selects Pro/Standard + V2.6/V3 via params. modelKey is the user-facing key.
 */
export function buildKlingMotionControlRecipe(opts: MotionControlOpts) {
  const { imageUrl, videoUrl, orientation, keepSound, modelKey, prompt } = opts;

  const modelName = /\/pro\//i.test(modelKey) ? "Pro" : "Standard";
  const modelVersion = /v3/i.test(modelKey) ? "V3" : "V2.6";
  const model = "fal-ai/kling-Video/v2.6/standard/motion-control";

  const now = Date.now();
  const n1 = `n_${now}_img`;
  const n2 = `n_${now}_vid`;
  const n3 = `n_${now}_mdl`;

  const imgNode = {
    id: n1,
    type: "import",
    dragHandle: ".node-header",
    owner: null,
    visibility: null,
    isModel: false,
    data: {
      handles: {
        output: {
          file: { type: "any", label: "File", order: 0, format: "uri", description: "The uploaded file" },
        },
      },
      name: "File",
      description: null,
      color: "Yambo_Blue",
      dark_color: "Yambo_Blue_Dark",
      border_color: "Yambo_Blue_Stroke",
      files: [
        {
          type: "image",
          url: imageUrl,
          publicId: "uploads/" + mkId(),
          id: mkId(),
          name: "image.jpg",
          insertionOrder: 0,
        },
      ],
      cameraLocked: false,
      selectedIndex: 0,
      result: {
        type: "image",
        url: imageUrl,
        publicId: "uploads/" + mkId(),
        id: mkId(),
        name: "image.jpg",
        insertionOrder: 0,
      },
      output: {
        file: {
          type: "image",
          url: imageUrl,
          publicId: "uploads/" + mkId(),
          id: mkId(),
          name: "image.jpg",
          insertionOrder: 0,
        },
      },
      version: 3,
    },
    position: { x: 80, y: 200 },
    width: 460,
    height: 400,
  };

  const vidNode = {
    id: n2,
    type: "import",
    dragHandle: ".node-header",
    owner: null,
    visibility: null,
    isModel: false,
    data: {
      handles: {
        output: {
          file: { type: "any", label: "File", order: 0, format: "uri", description: "The uploaded file" },
        },
      },
      name: "File",
      description: null,
      color: "Yambo_Blue",
      dark_color: "Yambo_Blue_Dark",
      border_color: "Yambo_Blue_Stroke",
      files: [
        {
          type: "video",
          url: videoUrl,
          publicId: "uploads/" + mkId(),
          id: mkId(),
          name: "video.mp4",
          insertionOrder: 0,
        },
      ],
      cameraLocked: false,
      selectedIndex: 0,
      result: {
        type: "video",
        url: videoUrl,
        publicId: "uploads/" + mkId(),
        id: mkId(),
        name: "video.mp4",
        insertionOrder: 0,
      },
      output: {
        file: {
          type: "video",
          url: videoUrl,
          publicId: "uploads/" + mkId(),
          id: mkId(),
          name: "video.mp4",
          insertionOrder: 0,
        },
      },
      version: 3,
    },
    position: { x: 80, y: 650 },
    width: 460,
    height: 400,
  };

  const modelNode = {
    id: n3,
    type: "custommodelV2",
    dragHandle: ".node-header",
    owner: null,
    visibility: "private",
    isModel: true,
    data: {
      handles: {
        input: {
          prompt: { id: "input-prompt", type: "text", label: "prompt", format: "text", required: false },
          image_url: { id: "input-image_url", type: "image", label: "image", format: "text", required: true },
          video_url: { id: "input-video_url", type: "any", label: "video", format: "text", required: true },
        },
        output: { result: { id: "output-result", type: "video", label: "result", order: 0, format: "uri" } },
      },
      name: "Kling Motion Control",
      description: "Transfer movements from a reference video to any character image.",
      color: "Red",
      menu: { icon: "EmojiObjectsIcon", isModel: true, displayName: "Kling Motion Control" },
      model: { name: model, service: "fal_imported", version: model },
      params: {
        model: modelName,
        version: modelVersion,
        keep_original_sound: keepSound,
        character_orientation: orientation,
        ...(prompt ? { prompt } : {}),
      },
      schema: {
        model: { type: "enum", order: 0, title: "Model", default: "Pro", options: ["Pro", "Standard"] },
        prompt: { type: "string", title: "Prompt", required: false },
        version: { type: "enum", order: -1, title: "Version", default: "V2.6", options: ["V2.6", "V3"] },
        keep_original_sound: { type: "boolean", title: "Keep Original Sound", default: true, required: false },
        character_orientation: { type: "enum", title: "Character Orientation", options: ["image", "video"], required: true },
      },
      version: 3,
      kind: {
        type: "wildcard",
        model: {
          type: "predefined",
          name: model,
          version: model,
          service: "fal_imported",
          description: "Transfer movements from a reference video to any character image.",
        },
        inputs: [
          [{ id: "prompt", title: "Prompt", validTypes: ["text"], required: false }, null],
          [
            { id: "image_url", title: "image", validTypes: ["image"], required: true },
            { nodeId: n1, outputId: "file" },
          ],
          [
            {
              id: "video_url",
              title: "video",
              validTypes: ["image", "video", "audio", "3D", "text", "number", "boolean", "seed", "array", "lora", "kling-element", "runway-aleph2-keyframe"],
              required: true,
            },
            { nodeId: n2, outputId: "file" },
          ],
        ],
        parameters: [
          [
            {
              id: "version",
              title: "Version",
              description: "Kling Motion Control version",
              constraint: { type: "enum", options: ["V2.6", "V3"] },
              defaultValue: { type: "string", value: "V2.6" },
            },
            { type: "value", data: { type: "string", value: modelVersion } },
          ],
          [
            {
              id: "model",
              title: "Model",
              description: "Kling Motion Control type",
              constraint: { type: "enum", options: ["Pro", "Standard"] },
              defaultValue: { type: "string", value: "Pro" },
            },
            { type: "value", data: { type: "string", value: modelName } },
          ],
          [
            {
              id: "keep_original_sound",
              title: "Keep Original Sound",
              description: "Whether to keep the original sound from the reference video.",
              constraint: { type: "boolean" },
              defaultValue: { type: "boolean", value: true },
            },
            { type: "value", data: { type: "boolean", value: keepSound } },
          ],
          [
            {
              id: "character_orientation",
              title: "Character Orientation",
              description: "Controls whether the output character's orientation matches the reference image or video.",
              constraint: { type: "enum", options: ["image", "video"] },
              defaultValue: { type: "string", value: "image" },
            },
            { type: "value", data: { type: "string", value: orientation } },
          ],
        ],
        outputs: [{ id: "result", title: "result", description: "Result video" }],
      },
      generations: [],
      selectedIndex: 0,
      cameraLocked: false,
      result: [],
      output: {},
      selectedOutput: 0,
    },
    position: { x: 600, y: 400 },
    width: 460,
    height: 560,
  };

  const edges = [
    {
      id: "e-" + mkId(),
      source: n1,
      target: n3,
      sourceHandle: `${n1}-output-file`,
      targetHandle: `${n3}-input-image_url`,
      type: "custom",
      data: { sourceColor: "Yambo_Blue", targetColor: "Red", sourceHandleType: "any", targetHandleType: "image" },
    },
    {
      id: "e-" + mkId(),
      source: n2,
      target: n3,
      sourceHandle: `${n2}-output-file`,
      targetHandle: `${n3}-input-video_url`,
      type: "custom",
      data: { sourceColor: "Yambo_Blue", targetColor: "Red", sourceHandleType: "any", targetHandleType: "video" },
    },
  ];

  return { nodes: [imgNode, vidNode, modelNode], edges, modelId: model };
}
