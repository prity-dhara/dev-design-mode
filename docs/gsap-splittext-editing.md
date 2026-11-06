# Editing GSAP SplitText in Design Mode

Design Mode treats generated `.char`, `.word`, `.line`, `.gsap_split_word`,
and `.gsap_split_word-mask` wrappers as **one logical text element**. The
original `h1`–`h6` / `p` / text host stays selected with its existing classes,
attributes, styles and accessible text.

## Default: source-only, non-destructive

Most production websites keep the `SplitText` instance inside an application
closure. An extension cannot retrieve that private instance from the DOM.

Without access to the instance, the editor **does not** modify generated spans
or call `revert()`. It records one source-text change containing the original
host selector and page URL for an agent or Webflow developer to implement.
Styling changes target the source host, not its words. The running animation
continues untouched.

On Webflow the page URL + CSS selector is a locator, not a claimed file path.

## Optional: allow safe live rebuilding

If you own the Webflow custom code, register the original text element and
its SplitText instance in the page's MAIN world. This opt-in is required for
live text changes because rebuilding the split wrappers **alone** cannot
rebuild an existing GSAP timeline:

```js
window.__designModeSplitTextRegistry ||= new WeakMap();

const heading = document.querySelector(".hero-heading");
const options = { type: "words,chars" };
let split = SplitText.create(heading, options);
let tween = gsap.from(split.words, {
  yPercent: 100, stagger: 0.045, duration: 0.8, ease: "power3.out"
});

window.__designModeSplitTextRegistry.set(heading, {
  split,
  SplitText,
  options,
  rebuildAnimation(newSplit) {
    tween?.kill();
    tween = gsap.from(newSplit.words, {
      yPercent: 100, stagger: 0.045, duration: 0.8, ease: "power3.out"
    });
    ScrollTrigger?.refresh?.();
  }
});
```

The extension calls `split.revert()`, sets the **parent** element's new
`textContent`, creates a new SplitText with the registered options, invokes
`rebuildAnimation(newSplit)`, and replaces the registered instance. The page
owns the animation configuration; Design Mode does not guess its timeline.

Register your *actual* SplitText instance, not a second instance created just
for the editor. Provide the actual responsive / autoSplit settings and
rebuild callback used on your site.

## Test

```bash
git pull origin main
npm run build:extension
npm run typecheck:extension
npm run test:extension
```

Reload the unpacked Chrome extension and refresh your staging Webflow site.
Select a generated word or character; the parent heading should be selected.
When unregistered, saving records a source-only change while live GSAP spans
remain untouched. When registered, saving also rebuilds the animation.

The extension cannot provide a real source-code line when a published Webflow
page does not expose source-map information. Use the page URL and CSS selector.
