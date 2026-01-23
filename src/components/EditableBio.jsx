import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea'; // Assuming you have a Textarea component
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Edit2 } from 'lucide-react';

// Create Textarea component if it doesn't exist
// src/components/ui/textarea.jsx
// import React from "react"
// import { cn } from "@/lib/utils"
// const Textarea = React.forwardRef(({ className, ...props }, ref) => {
//   return (
//     (<textarea
//       className={cn(
//         "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
//         className
//       )}
//       ref={ref}
//       {...props} />)
//   );
// })
// Textarea.displayName = "Textarea"
// export { Textarea }


const EditableBio = ({ initialBio, onBioChange }) => {
  const [bio, setBio] = useState(initialBio);
  const [isEditing, setIsEditing] = useState(false);

  const handleSave = () => {
    onBioChange(bio);
    setIsEditing(false);
  };

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setIsEditing(true)} className="h-7 w-7 text-muted-foreground hover:text-primary">
        <Edit2 size={16} />
        <span className="sr-only">Editar bio</span>
      </Button>

      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Descrição (Bio)</DialogTitle>
            <DialogDescription>
              Conte mais sobre sua experiência, serviços e o que te torna um ótimo profissional.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Escreva sua bio aqui..."
            rows={5}
            className="my-4"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsEditing(false); setBio(initialBio); }}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar Bio</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default EditableBio;