import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Home } from 'lucide-react';

const NotFound = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center max-w-md"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="w-24 h-24 rounded-full profile-gradient mx-auto mb-6 flex items-center justify-center"
        >
          <span className="text-white text-4xl font-bold">404</span>
        </motion.div>
        
        <h1 className="text-3xl font-bold mb-4">Página não encontrada</h1>
        <p className="text-muted-foreground mb-8">
          A página que você está procurando não existe ou foi removida.
        </p>
        
        <Link to="/">
          <Button className="gap-2">
            <Home size={18} />
            Voltar para o início
          </Button>
        </Link>
      </motion.div>
    </div>
  );
};

export default NotFound;