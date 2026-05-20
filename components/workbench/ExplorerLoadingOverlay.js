import { useEffect, useState } from "react";

// Extracted from the published Claude spinner verb list the user linked.
const CLAUDE_CODE_LOADING_VERBS = Object.freeze([
  "Accomplishing",
  "Actioning",
  "Actualizing",
  "Architecting",
  "Baking",
  "Beaming",
  "Beboppin'",
  "Befuddling",
  "Billowing",
  "Blanching",
  "Bloviating",
  "Boogieing",
  "Boondoggling",
  "Booping",
  "Bootstrapping",
  "Brewing",
  "Bunning",
  "Burrowing",
  "Calculating",
  "Canoodling",
  "Caramelizing",
  "Cascading",
  "Catapulting",
  "Cerebrating",
  "Channeling",
  "Channelling",
  "Choreographing",
  "Churning",
  "Coalescing",
  "Cogitating",
  "Combobulating",
  "Composing",
  "Computing",
  "Concocting",
  "Considering",
  "Contemplating",
  "Cooking",
  "Crafting",
  "Creating",
  "Crunching",
  "Crystallizing",
  "Cultivating",
  "Deciphering",
  "Deliberating",
  "Determining",
  "Dilly-dallying",
  "Discombobulating",
  "Doing",
  "Doodling",
  "Drizzling",
  "Ebbing",
  "Effecting",
  "Elucidating",
  "Embellishing",
  "Enchanting",
  "Envisioning",
  "Evaporating",
  "Fermenting",
  "Fiddle-faddling",
  "Finagling",
  "Flambéing",
  "Flibbertigibbeting",
  "Flowing",
  "Flummoxing",
  "Fluttering",
  "Forging",
  "Forming",
  "Frolicking",
  "Frosting",
  "Gallivanting",
  "Galloping",
  "Garnishing",
  "Generating",
  "Gesticulating",
  "Germinating",
  "Gitifying",
  "Grooving",
  "Gusting",
  "Harmonizing",
  "Hashing",
  "Hatching",
  "Herding",
  "Honking",
  "Hullaballooing",
  "Hyperspacing",
  "Ideating",
  "Imagining",
  "Improvising",
  "Incubating",
  "Inferring",
  "Infusing",
  "Ionizing",
  "Jitterbugging",
  "Julienning",
  "Kneading",
  "Leavening",
  "Levitating",
  "Lollygagging",
  "Manifesting",
  "Marinating",
  "Meandering",
  "Metamorphosing",
  "Misting",
  "Moonwalking",
  "Moseying",
  "Mulling",
  "Mustering",
  "Musing",
  "Nebulizing",
  "Nesting",
  "Newspapering",
  "Noodling",
  "Nucleating",
  "Orbiting",
  "Orchestrating",
  "Osmosing",
  "Perambulating",
  "Percolating",
  "Perusing",
  "Philosophising",
  "Photosynthesizing",
  "Pollinating",
  "Pondering",
  "Pontificating",
  "Pouncing",
  "Precipitating",
  "Prestidigitating",
  "Processing",
  "Proofing",
  "Propagating",
  "Puttering",
  "Puzzling",
  "Quantumizing",
  "Razzle-dazzling",
  "Razzmatazzing",
  "Recombobulating",
  "Reticulating",
  "Roosting",
  "Ruminating",
  "Sautéing",
  "Scampering",
  "Schlepping",
  "Scurrying",
  "Seasoning",
  "Shenaniganing",
  "Shimmying",
  "Simmering",
  "Skedaddling",
  "Sketching",
  "Slithering",
  "Smooshing",
  "Sock-hopping",
  "Spelunking",
  "Spinning",
  "Sprouting",
  "Stewing",
  "Sublimating",
  "Swirling",
  "Swooping",
  "Symbioting",
  "Synthesizing",
  "Tempering",
  "Thinking",
  "Thundering",
  "Tinkering",
  "Tomfoolering",
  "Topsy-turvying",
  "Transfiguring",
  "Transmuting",
  "Twisting",
  "Undulating",
  "Unfurling",
  "Unravelling",
  "Vibing",
  "Waddling",
  "Wandering",
  "Warping",
  "Whatchamacalliting",
  "Whirlpooling",
  "Whirring",
  "Whisking",
  "Wibbling",
  "Working",
  "Wrangling",
  "Zesting",
  "Zigzagging"
]);

function shuffledLoadingVerbs() {
  const verbs = [...CLAUDE_CODE_LOADING_VERBS];
  for (let index = verbs.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [verbs[index], verbs[swapIndex]] = [verbs[swapIndex], verbs[index]];
  }
  return verbs;
}

export default function ExplorerLoadingOverlay({
  explorerLoading,
  previewMode
}) {
  const [loadingVerbs, setLoadingVerbs] = useState(() => shuffledLoadingVerbs());
  const [activeWordIndex, setActiveWordIndex] = useState(0);
  const [spinnerFrameIndex, setSpinnerFrameIndex] = useState(0);
  const [ellipsisFrameIndex, setEllipsisFrameIndex] = useState(0);

  const ASCII_SPINNER_FRAMES = ["|", "/", "-", "\\"];
  const ASCII_ELLIPSIS_FRAMES = ["", ".", "..", "..."];

  useEffect(() => {
    if (!explorerLoading || previewMode) {
      return undefined;
    }

    const nextLoadingVerbs = shuffledLoadingVerbs();
    setLoadingVerbs(nextLoadingVerbs);
    setActiveWordIndex(0);
    setSpinnerFrameIndex(0);
    setEllipsisFrameIndex(0);

    const verbIntervalId = window.setInterval(() => {
      setActiveWordIndex((current) => (current + 1) % nextLoadingVerbs.length);
    }, 900);

    const spinnerIntervalId = window.setInterval(() => {
      setSpinnerFrameIndex((current) => (current + 1) % ASCII_SPINNER_FRAMES.length);
    }, 90);

    const ellipsisIntervalId = window.setInterval(() => {
      setEllipsisFrameIndex((current) => (current + 1) % ASCII_ELLIPSIS_FRAMES.length);
    }, 360);

    return () => {
      window.clearInterval(verbIntervalId);
      window.clearInterval(spinnerIntervalId);
      window.clearInterval(ellipsisIntervalId);
    };
  }, [previewMode, explorerLoading]);

  if (!explorerLoading || previewMode) {
    return null;
  }

  const activeVerb = loadingVerbs[activeWordIndex] || CLAUDE_CODE_LOADING_VERBS[0];
  const spinnerFrame = ASCII_SPINNER_FRAMES[spinnerFrameIndex];
  const ellipsis = ASCII_ELLIPSIS_FRAMES[ellipsisFrameIndex];

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <div className="cad-loading-overlay absolute inset-0" />
      <div className="absolute inset-0 flex items-center justify-center px-4">
        <div
          role="status"
          aria-live="polite"
          className="cad-loading-ascii relative z-10 max-w-[min(90vw,38rem)] text-center font-mono text-sm text-popover-foreground"
        >
          <span className="sr-only">{activeVerb}</span>
          <span className="inline-flex w-[24ch] items-start justify-start text-left sm:w-[26ch]">
            <span className="inline-block w-[2ch]">{spinnerFrame}</span>
            <span className="inline-block w-[1ch]"> </span>
            <span>{activeVerb}</span>
            <span className="inline-block w-[3ch]">{ellipsis}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
