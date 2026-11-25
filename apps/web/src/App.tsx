import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import { Link, Route, Routes } from 'react-router';
import { Shell } from './components/Shell';
import { Home } from './pages/Home';
import { Room } from './pages/Room';

function NotFound() {
  return (
    <Shell>
      <div className="panel mx-auto mt-8 max-w-md p-5 text-center">
        <h1 className="text-xl font-bold">Page not found</h1>
        <Link className="btn btn-primary mt-3" to="/">
          Go home
        </Link>
      </div>
    </Shell>
  );
}

export function App() {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/r/:code" element={<Room />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </MotionConfig>
    </LazyMotion>
  );
}
