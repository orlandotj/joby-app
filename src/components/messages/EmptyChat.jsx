import React from 'react';
import { MessageSquare } from 'lucide-react';
import { motion } from 'framer-motion';

const EmptyChat = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-4">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6"
      >
        <MessageSquare size={40} className="text-muted-foreground" />
      </motion.div>
      <h3 className="text-xl font-medium mb-2 text-foreground">Suas mensagens</h3>
      <p className="text-muted-foreground max-w-xs sm:max-w-md">
        Selecione uma conversa na lista à esquerda para começar a trocar mensagens ou encontrar novos profissionais na aba Explorar.
      </p>
    </div>
  );
};

export default EmptyChat;