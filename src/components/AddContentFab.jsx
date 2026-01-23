import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Image as ImageIcon,
  Video as VideoIcon,
  Film,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

const AddContentFab = ({ onOpenUploadDialog }) => {
  const [isOpen, setIsOpen] = useState(false)

  const fabOptions = [
    { icon: <ImageIcon size={20} />, label: 'Foto', type: 'photo' },
    {
      icon: <VideoIcon size={20} />,
      label: 'Vídeo Curto',
      type: 'short-video',
    },
    { icon: <Film size={20} />, label: 'Vídeo Longo', type: 'long-video' },
  ]

  const fabVariants = {
    closed: { scale: 0, opacity: 0 },
    open: { scale: 1, opacity: 1 },
  }

  const itemVariants = {
    closed: { opacity: 0, y: 20 },
    open: (i) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: i * 0.05,
        type: 'spring',
        stiffness: 300,
        damping: 20,
      },
    }),
  }

  return (
    <div
      className="fixed bottom-24 right-4 md:bottom-20 md:right-6 z-[70]"
      style={{
        position: 'fixed',
        willChange: 'transform',
        transform: 'translateZ(0)',
      }}
    >
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="flex flex-col items-center space-y-2 mb-2"
            initial="closed"
            animate="open"
            exit="closed"
            variants={{
              open: {
                transition: { staggerChildren: 0.07, delayChildren: 0.2 },
              },
              closed: {
                transition: { staggerChildren: 0.05, staggerDirection: -1 },
              },
            }}
          >
            {fabOptions.map((option, i) => (
              <motion.div
                key={option.type}
                variants={itemVariants}
                custom={i}
                className="flex items-center"
              >
                <span className="text-xs bg-card text-card-foreground px-2 py-1 rounded-md shadow-sm mr-2">
                  {option.label}
                </span>
                <Button
                  size="icon"
                  className="rounded-full h-10 w-10 joby-gradient-alt text-primary-foreground shadow-md"
                  onClick={() => {
                    onOpenUploadDialog(option.type)
                    setIsOpen(false)
                  }}
                >
                  {option.icon}
                </Button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <Button
        size="icon"
        className="rounded-full h-14 w-14 joby-gradient text-primary-foreground shadow-xl"
        onClick={() => setIsOpen(!isOpen)}
      >
        <motion.div animate={{ rotate: isOpen ? 45 : 0 }}>
          <Plus size={28} />
        </motion.div>
      </Button>
    </div>
  )
}

export default AddContentFab
