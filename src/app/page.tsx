import Link from "next/link";
import { ArrowUpRight, ArrowRight, Check, MoveRight } from "lucide-react";
import { Brand } from "../components/Brand";
import { Preview } from "../components/Preview";
import { sampleMedia, sampleProject } from "../shared/project";
export default function Home() {
  return (
    <>
      <header className="site-header">
        <Brand />
        <nav>
          <Link href="/projects">Your projects</Link>
          <Link href="/auth" className="button small secondary">
            Sign in <ArrowUpRight size={15} />
          </Link>
        </nav>
      </header>
      <main className="home">
        <section className="home-copy">
          <div className="eyebrow">
            <span className="blue-dot" /> THE BIG REVEAL, MADE SIMPLE
          </div>
          <h1>
            Good redesigns
            <br />
            deserve a<br />
            <em>great reveal.</em>
          </h1>
          <p className="home-description">
            Turn your website redesign into your next client pitch. From two
            screenshots to one polished before-and-after video.
          </p>
          <Link href="/editor/new" className="button primary large">
            Create a video <ArrowRight size={18} />
          </Link>
          <div className="home-details">
            <span>
              <Check size={14} /> Your screenshots
            </span>
            <span>
              <Check size={14} /> Your brand
            </span>
            <span>
              <Check size={14} /> 15 seconds
            </span>
          </div>
          <div className="home-note">
            <span className="note-line" />
            <p>
              A little transformation.
              <br />A whole new first impression.
            </p>
          </div>
        </section>
        <section className="home-stage" aria-label="Interactive sample video">
          <div className="stage-label">
            <span>MEET YOUR NEXT PORTFOLIO PIECE</span>
            <MoveRight size={22} />
          </div>
          <div className="sample-stage">
            <div className="stage-grid" />
            <div className="floating-label before-label">
              The same website.
              <br />
              <strong>A new perspective.</strong>
              <span>↘</span>
            </div>
            <Preview
              input={{ project: sampleProject, ...sampleMedia() }}
              compact
            />
            <span className="format-tag">
              1080 × 1920 <span>·</span> MP4
            </span>
          </div>
          <div className="stage-bottom">
            <span className="sample-dot" />
            <span>Forma Studio</span>
            <span className="muted">Original fictional sample</span>
            <span className="sample-instruction">
              Press play to see the reveal ↑
            </span>
          </div>
        </section>
      </main>
      <footer className="home-footer">
        <span>A focused tool for independent web designers.</span>
        <span>
          TWO SCREENSHOTS <span className="footer-arrow">→</span> ONE GOOD
          STORY.
        </span>
      </footer>
    </>
  );
}
