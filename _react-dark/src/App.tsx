import { useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { pathOf, savedMode } from './lib/mode'
import { ProfileContext, clearProfile, loadProfile, saveProfile, type Profile } from './lib/profile'
import Home from './pages/Home'
import Onboarding from './pages/Onboarding'
import Plan from './pages/Plan'
import ProfilePage from './pages/Profile'
import Welcome from './pages/Welcome'

export default function App() {
  const [profile, setProfileState] = useState<Profile | null>(loadProfile)

  // Each screen opens at its top; a link to a meal (#lunch) is scrolled to by the Meals screen.
  const { pathname, hash } = useLocation()
  const section = pathname.split('/')[1]
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0)
  }, [section, hash])

  const store = useMemo(
    () => ({
      profile,
      setProfile: (next: Profile | null) => {
        if (next) saveProfile(next)
        else clearProfile()
        setProfileState(next)
      },
    }),
    [profile],
  )

  return (
    <ProfileContext.Provider value={store}>
      <Routes>
        <Route path="/" element={profile ? <Home /> : <Welcome />} />
        <Route path="/setup" element={<Onboarding />} />
        <Route path="/plan" element={<Navigate to={`/plan/${pathOf(savedMode())}`} replace />} />
        <Route path="/profile" element={profile ? <ProfilePage /> : <Navigate to="/" replace />} />
        <Route path="/plan/:mode" element={profile ? <Plan /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ProfileContext.Provider>
  )
}
