import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, Globe, Layers3, MessageSquare } from "lucide-react";
import styles from "./launch-workflow.module.css";

export function LaunchWorkflow() {
  return (
    <div className={styles.grid}>
      <article>
        <div className={styles.importVisual} aria-hidden="true">
          <div className={styles.urlBar}>
            <Globe size={13} />
            <span>your-product.com</span>
            <ArrowRight size={13} />
          </div>
          <div className={styles.captures}>
            {["Desktop", "Feature", "Mobile"].map((name, index) => (
              <div key={name}>
                <Image
                  src={
                    index === 0
                      ? "/sample/launch-before.png"
                      : "/sample/launch-after.png"
                  }
                  alt=""
                  width={2560}
                  height={1760}
                  sizes="150px"
                />
                <span>{name}</span>
              </div>
            ))}
          </div>
          <div className={styles.visualNote}>
            <Check size={12} /> Your website becomes a complete video.
          </div>
        </div>
        <div className={styles.copy}>
          <span>
            <Globe size={14} /> 01 / BRING THE PRODUCT
          </span>
          <h3>A link. A complete video.</h3>
          <p>
            Paste a public website link. Review the captured screens and
            suggested story, then export your video with captions and music.
          </p>
          <Link href="/create" className={styles.createLink}>
            Create from a link <ArrowRight size={14} />
          </Link>
        </div>
      </article>
      <article>
        <div className={styles.recipeVisual} aria-hidden="true">
          <div className={styles.recipeHeader}>
            <Layers3 size={16} />
            <span>YOUR LAUNCH RECIPE</span>
            <span>01</span>
          </div>
          <strong>The next product update.</strong>
          <div className={styles.recipeRows}>
            <div>
              <span>Your signature</span>
              <span className={styles.palette}>
                <i />
                <i />
                <i />
              </span>
            </div>
            <div>
              <span>Your story</span>
              <span className={styles.beats}>
                <i />
                <i />
                <i />
                <i />
              </span>
            </div>
            <div>
              <span>The next version</span>
              <span>
                Replace media <ArrowRight size={12} />
              </span>
            </div>
          </div>
          <div className={styles.visualNote}>
            <Check size={12} /> Keep the edit. Refresh the product.
          </div>
        </div>
        <div className={styles.copy}>
          <span>
            <Layers3 size={14} /> 02 / KEEP YOUR DIRECTION
          </span>
          <h3>Next time, start ahead.</h3>
          <p>
            Save your branding, copy, timing, and framing as a recipe. Swap a
            screen or clip for the next launch and keep the decisions that
            worked.
          </p>
        </div>
      </article>
      <article>
        <div className={styles.reviewVisual} aria-hidden="true">
          <div className={styles.reviewHeader}>
            <span>YOUR STUDIO / CLIENT REVIEW</span>
            <MessageSquare size={13} />
          </div>
          <div className={styles.reviewFilm}>
            <Image
              src="/films/campaign/landscape-original.webp"
              alt=""
              width={960}
              height={540}
              sizes="220px"
            />
            <span>VERSION 01</span>
          </div>
          <div className={styles.comment}>
            <span>00:08</span>
            <p>Let’s show the dashboard first.</p>
          </div>
          <span className={styles.reviewStatus}>
            <span /> Changes requested
          </span>
          <span className={styles.exampleLabel}>EXAMPLE CLIENT FEEDBACK</span>
        </div>
        <div className={styles.copy}>
          <span>
            <MessageSquare size={14} /> 03 / CLOSE THE LOOP
          </span>
          <h3>Feedback, at the right frame.</h3>
          <p>
            Send a branded review link. Collect timestamped comments and
            approval on the exact export, with no client account needed.
          </p>
        </div>
      </article>
    </div>
  );
}
