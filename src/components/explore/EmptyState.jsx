import React from 'react';
import { motion } from 'framer-motion';
import { SearchX } from 'lucide-react';

const EmptyState = () => {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6"
      >
        <SearchX size={40} className="text-muted-foreground" />
      </motion.div>
      <h3 className="text-xl font-medium mb-2 text-foreground">Nenhum resultado encontrado</h3>
      <p className="text-muted-foreground max-w-md">
        Tente buscar por profissão ou serviço.
      </p>
    </div>
  );
};

export default EmptyState;